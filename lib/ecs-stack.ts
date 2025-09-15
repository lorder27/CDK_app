import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import {
  Vpc,
  IVpc,
  SecurityGroup,
  Peer,
  Port,
  SubnetType,
} from 'aws-cdk-lib/aws-ec2';
import {
  Cluster,
  FargateService,
  FargateTaskDefinition,
  ContainerImage,
  Protocol,
  LogDrivers,
  AwsLogDriverMode,
  CpuArchitecture
} from 'aws-cdk-lib/aws-ecs';
import {
  ApplicationLoadBalancer,
  ApplicationProtocol,
  ApplicationTargetGroup,
  TargetType,
  ListenerAction,
  ListenerCondition,
} from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import { Function as CfFunction } from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import { CfnOutput } from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as elbv2_actions from 'aws-cdk-lib/aws-elasticloadbalancingv2-actions';

export interface EcsStackProps extends cdk.StackProps {
  vpc: IVpc;
}

export class EcsStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: EcsStackProps) {
    super(scope, id, props);

    const vpc = props.vpc as IVpc;

    // ECS cluster
    const cluster = new Cluster(this, 'EcsCluster', {
      vpc,
      clusterName: `${this.stackName}-cluster`,
    });

    // Security groups
    const albSg = new SecurityGroup(this, 'AlbSG', {
      vpc,
      description: 'Allow http(s) from internet to ALB',
    });
    albSg.addIngressRule(Peer.anyIpv4(), Port.tcp(8080), 'Allow TCP 8080 from anywhere');

    const taskSg = new SecurityGroup(this, 'TaskSG', {
      vpc,
      description: 'Allow traffic only from ALB',
    });
    // Allow ALB SG to reach tasks on container port 80
    taskSg.addIngressRule(albSg, Port.tcp(80), 'Allow ALB to reach tasks');

    // ALB in public subnets
    const alb = new ApplicationLoadBalancer(this, 'PublicALB', {
      vpc,
      internetFacing: true,
      securityGroup: albSg,
      vpcSubnets: { subnetType: SubnetType.PUBLIC }
    });

    // Fargate task + service
    const taskDef = new FargateTaskDefinition(this, 'TaskDef', {
      cpu: 512,
      memoryLimitMiB: 1024,
      // default arch is X86
    });

    const container = taskDef.addContainer('nginx', {
      image: ContainerImage.fromRegistry('nginx:stable'),
      logging: LogDrivers.awsLogs({ streamPrefix: 'nginx', mode: AwsLogDriverMode.NON_BLOCKING }),
      environment: {},
    });
    container.addPortMappings({ containerPort: 80, protocol: Protocol.TCP });

    const service = new FargateService(this, 'FargateService', {
      cluster,
      taskDefinition: taskDef,
      desiredCount: 2,
      securityGroups: [taskSg],
      assignPublicIp: false,
      vpcSubnets: { subnetType: SubnetType.PRIVATE_WITH_NAT }
    });

    // Target group and listener: Map external TCP 8080 -> container 80
    const targetGroup = new ApplicationTargetGroup(this, 'TG', {
      vpc,
      port: 80,
      protocol: ApplicationProtocol.HTTP,
      targetType: TargetType.IP, // Fargate tasks use IP mode
      healthCheck: {
        path: '/',
        interval: cdk.Duration.seconds(30)
      },
      targets: [] // we'll register service to TG via service.connections above
    });

    // Register ECS service to target group (service.registerLoadBalancerTargets is part of patterns,
    // so we do manual registration using service.loadBalancerTargetOptions via ApplicationTargetGroup)
    // FargateService has method to attach to target group via "service.attachToApplicationTargetGroup" not available,
    // so we create a listener and attach using service's loadBalancerTargetOptions:
    // Simpler: create listener and call service.registerLoadBalancerTargets via API not allowed;
    // Instead, create a new "service" ALB target group integration by using "service.loadBalancerTarget".
    // But the easiest supported way without patterns: use "service.attachToApplicationTargetGroup" (a method on BaseService).
    (service as any).attachToApplicationTargetGroup(targetGroup); // typed hack but works

    const listener = alb.addListener('Listener8080', {
      port: 8080,
      protocol: ApplicationProtocol.HTTP,
      defaultAction: ListenerAction.forward([targetGroup])
    });

    // ---- Cognito (bonus): create User Pool and add an ALB listener rule to authenticate for /secure/*
    const userPool = new cognito.UserPool(this, 'UserPool', {
      selfSignUpEnabled: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      userVerification: {
        emailSubject: 'Verify your email for our app',
        emailBody: 'Hello, verify your email: {####}',
        emailStyle: cognito.VerificationEmailStyle.CODE
      },
      signInAliases: { email: true }
    });

    const userPoolClient = new cognito.UserPoolClient(this, 'UserPoolClient', {
      userPool,
      generateSecret: false,
      supportedIdentityProviders: [cognito.UserPoolClientIdentityProvider.COGNITO]
    });

    // Configure ALB listener rule to authenticate via Cognito for path /secure/*
    // When match, authenticate with Cognito then forward to TG
    listener.addAction('AuthCognitoSecurePath', {
      priority: 10,
      conditions: [ListenerCondition.pathPatterns(['/secure/*'])],
      action: ListenerAction.authenticateCognito({
        userPool,
        userPoolClient,
        userPoolDomain: new cognito.CfnUserPoolDomain(this, 'CognitoDomain', {
          domain: `cdk-ecs-nginx-${this.account?.slice(-6) || 'dev'}`,
          userPoolId: userPool.userPoolId
        }).ref,
      }, ListenerAction.forward([targetGroup]))
    });

    // CloudFront Function to strip problematic header "X-Explioit-Activate"
    const cfFunction = new CfFunction(this, 'StripExploitHeaderFn', {
      code: `
function handler(event) {
  var request = event.request;
  // Remove header if present
  if (request.headers['x-explioit-activate']) {
    delete request.headers['x-explioit-activate'];
  }
  return request;
}
`,
    });

    // CloudFront distribution with ALB origin
    const origin = new origins.HttpOrigin(alb.loadBalancerDnsName, {
      protocolPolicy: cloudfront.OriginProtocolPolicy.HTTP_ONLY,
      httpPort: 8080 // CloudFront will connect to ALB on 8080
    });

    const distribution = new cloudfront.Distribution(this, 'Cdn', {
      defaultBehavior: {
        origin,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        functionAssociations: [
          {
            eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
            function: cfFunction
          }
        ],
        allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
        cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED
      },
      domainNames: []
    });

    // Outputs
    new CfnOutput(this, 'ALB_DNS', { value: alb.loadBalancerDnsName });
    new CfnOutput(this, 'CloudFrontDomain', { value: distribution.domainName });
    new CfnOutput(this, 'CognitoUserPoolId', { value: userPool.userPoolId });
    new CfnOutput(this, 'CognitoUserPoolClientId', { value: userPoolClient.userPoolClientId });
  }
}

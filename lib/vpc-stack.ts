import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Vpc, IVpc } from 'aws-cdk-lib/aws-ec2';

export interface VpcLookupStackProps extends cdk.StackProps {}

export class VpcLookupStack extends cdk.Stack {
  public readonly vpc: IVpc;

  constructor(scope: Construct, id: string, props?: VpcLookupStackProps) {
    super(scope, id, props);

    // Strategy:
    // - If context has 'vpcId' use fromLookup by vpcId.
    // - Otherwise try to find a VPC by 'Name' tag in context.vpcName.
    // - Otherwise (commented out) create a new VPC for quick testing.
    const vpcId = this.node.tryGetContext('vpcId') || process.env.VPC_ID;
    const vpcName = this.node.tryGetContext('vpcName') || process.env.VPC_NAME;

    if (vpcId) {
      this.vpc = Vpc.fromLookup(this, 'ImportedVpcById', { vpcId });
    } else if (vpcName) {
      this.vpc = Vpc.fromLookup(this, 'ImportedVpcByName', { tags: { Name: vpcName } });
    } else {
      // Uncomment the following block if you want CDK to create a new VPC for quick testing.
      /*
      this.vpc = new Vpc(this, 'DefaultVpc', {
        maxAzs: 2,
        natGateways: 1,
        subnetConfiguration: [
          { name: 'public', subnetType: SubnetType.PUBLIC, cidrMask: 24 },
          { name: 'private', subnetType: SubnetType.PRIVATE_WITH_NAT, cidrMask: 24 }
        ]
      });
      */
      throw new Error('No VPC ID or VPC Name provided. Please provide one via context or environment variables.');
    }
  }
}

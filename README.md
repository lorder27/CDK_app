# CDK ECS NGINX with CloudFront + Header Block + Cognito (example)

This CDK app deploys:
- A VPC (looked up by ID or Name, required by default)
- ECS Cluster and Fargate Service running nginx in **private** subnets
- Internet-facing ALB on port **8080** that forwards to container port **80**
- CloudFront distribution in front of the ALB
- CloudFront Function to **remove** the `X-Explioit-Activate` header
- Cognito User Pool + App client (bonus) and ALB auth action for `/secure/*`

> This repo does **not** use `aws_ecs_patterns` as requested.

## Prereqs

- Node 16+ (or supported by your CDK version)
- npm
- AWS CLI configured with credentials + region
- AWS CDK v2 installed (`npm install -g aws-cdk`)

## Setup

```bash
# clone or create repository, then:
npm install

# bootstrap if first time in the account/region
cdk bootstrap aws://ACCOUNT/REGION

# Provide an existing VPC ID or Name (required by default)
cdk context --set vpcId vpc-0123456789abcdef0
# or
cdk context --set vpcName my-vpc-name

# Synthesize
npm run build
npm run synth

# Deploy everything
npm run deploy
```

## Optional: Create a new VPC for quick testing

By default, the `VpcLookupStack` throws an error if you do not provide a VPC ID or Name.
If you want CDK to create a new VPC automatically for quick testing, open `lib/vpc-stack.ts` and **uncomment** the block:

```ts
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
```

Then remove the `throw new Error(...)` line.

## Outputs

After deployment the stack outputs include:
- ALB DNS name (internet reachable on port 8080)
- CloudFront Domain (use this as primary public endpoint; CloudFront forwards to ALB)
- Cognito User Pool and Client IDs

## Publish to GitHub

```bash
git init
git add .
git commit -m "cdk ecs nginx fargate + alb + cloudfront + cognito example"
gh repo create my-username/cdk-ecs-nginx --public --source=. --remote=origin --push
# OR manually add origin:
git remote add origin https://github.com/your-username/cdk-ecs-nginx.git
git branch -M main
git push -u origin main
```


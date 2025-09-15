# CDK ECS NGINX with CloudFront + Header Block + Cognito (example)

This CDK app deploys:
- A VPC (or looks up an existing VPC)
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

# Optional: if you want to make CDK look up an existing VPC, provide its id:
cdk context --set vpcId vpc-0123456789abcdef0
# or set environment variable:
export VPC_ID=vpc-0123456789abcdef0

# Synthesize
npm run build
npm run synth

# Deploy everything
npm run deploy

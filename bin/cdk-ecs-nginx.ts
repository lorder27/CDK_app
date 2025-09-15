#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { VpcLookupStack } from '../lib/vpc-stack';
import { EcsStack } from '../lib/ecs-stack';

const app = new cdk.App();

const vpcLookup = new VpcLookupStack(app, 'VpcLookupStack', {
  /* Optionally set VPC lookup properties via context or environment variables.
     If you want CDK to create a new VPC instead of lookup, modify VpcLookupStack accordingly. */
});

new EcsStack(app, 'EcsFargateStack', {
  vpc: vpcLookup.vpc,
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION }
});

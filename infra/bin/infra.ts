#!/usr/bin/env node
import { config } from "dotenv";
import * as cdk from "aws-cdk-lib/core";
import { Stage } from "../lib";

config({ path: ".env.production" });

const env = {
  account: process.env.CDK_ACCOUNT || process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_REGION || process.env.CDK_DEFAULT_REGION,
  certificateArn: process.env.CERTIFICATE_ARN!,
  domainNames: process.env.DOMAIN_NAMES!.split(","),
};

const app = new cdk.App();

new Stage(app, "Production", { env });
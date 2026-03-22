#!/usr/bin/env node
import * as cdk from "aws-cdk-lib/core";
import { Stage } from "../lib";
import { GitHubActionsKamalDeployStack } from "../lib/stacks";

const app = new cdk.App();

const env = {
  account: process.env.CDK_ACCOUNT || process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_REGION || process.env.CDK_DEFAULT_REGION,
} satisfies cdk.Environment;

new Stage(app, "Dev", { env });
new Stage(app, "Prod", { env });

new GitHubActionsKamalDeployStack(app, "GitHubActionsKamalDeployStack", { env });

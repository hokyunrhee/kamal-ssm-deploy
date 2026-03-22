import * as iam from "aws-cdk-lib/aws-iam";
import * as cdk from "aws-cdk-lib/core";
import { Construct } from "constructs";
import { KamalDeployRole } from "../constructs";

export class GitHubActionsKamalDeployStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: cdk.StackProps) {
    super(scope, id, props);

    const githubOidcProvider = new iam.OidcProviderNative(
      this,
      "GitHubOidcProvider",
      {
        url: "https://token.actions.githubusercontent.com",
        clientIds: ["sts.amazonaws.com"],
      },
    );

    const { role } = new KamalDeployRole(this, "KamalDeployRole", {
      provider: githubOidcProvider,
      organization: "hokyunrhee",
    });

    new cdk.CfnOutput(this, "RoleArn", {
      value: role.roleArn,
      description:
        "Use as role-to-assume in aws-actions/configure-aws-credentials",
    });
  }
}

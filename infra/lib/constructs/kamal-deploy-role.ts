import * as iam from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";

export interface KamalDeployRoleProps {
  provider: iam.IOidcProvider;
  organization: string;
  repository?: string;
  branches?: string[];
}

export class KamalDeployRole extends Construct {
  readonly role: iam.IRole;

  constructor(scope: Construct, id: string, props: KamalDeployRoleProps) {
    super(scope, id);

    const {
      provider,
      organization,
      repository = "*",
      branches = ["main"],
    } = props;

    const sub = branches.map(
      (branch) => `repo:${organization}/${repository}:ref:refs/heads/${branch}`,
    );

    const role = new iam.Role(this, "Role", {
      assumedBy: new iam.OpenIdConnectPrincipal(provider, {
        StringEquals: {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
        },
        StringLike: {
          "token.actions.githubusercontent.com:sub": sub,
        },
      }),
    });

    role.addToPolicy(
      new iam.PolicyStatement({
        sid: "EC2InstanceConnect",
        actions: ["ec2-instance-connect:SendSSHPublicKey"],
        resources: ["*"],
      }),
    );

    role.addToPolicy(
      new iam.PolicyStatement({
        sid: "SSMSession",
        actions: ["ssm:StartSession", "ssm:TerminateSession"],
        resources: ["*"],
      }),
    );

    role.addToPolicy(
      new iam.PolicyStatement({
        sid: "SSMMessages",
        actions: [
          "ssmmessages:CreateControlChannel",
          "ssmmessages:CreateDataChannel",
          "ssmmessages:OpenControlChannel",
          "ssmmessages:OpenDataChannel",
        ],
        resources: ["*"],
      }),
    );

    this.role = role;
  }
}

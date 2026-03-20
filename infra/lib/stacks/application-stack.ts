import * as cdk from "aws-cdk-lib/core";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import { Construct } from "constructs";

import { PublicInstance } from "../constructs";

export interface ApplicationStackProps extends cdk.StackProps {
  vpc: ec2.IVpc;
}

export class ApplicationStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: ApplicationStackProps) {
    super(scope, id, props);

    const { vpc } = props;

    const publicEc2 = new PublicInstance(this, "PublicEc2", {
      vpc,
    });

    new cdk.CfnOutput(this, "InstanceId", {
      value: publicEc2.instance.instanceId,
      description: "EC2 Instance ID — connect via: aws ssm start-session --target <id>",
    });
  }
}

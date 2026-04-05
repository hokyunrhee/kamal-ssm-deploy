import * as cdk from "aws-cdk-lib/core";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import { Construct } from "constructs";

import { Cdn, PublicInstance } from "../constructs";

export interface ApplicationStackProps extends cdk.StackProps {
  vpc: ec2.IVpc;
  certificate: acm.ICertificate;
  domainNames: string[];
}

export class ApplicationStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: ApplicationStackProps) {
    super(scope, id, props);

    const { vpc, certificate, domainNames } = props;

    const publicEc2 = new PublicInstance(this, "PublicEc2", {
      vpc,
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T4G,
        ec2.InstanceSize.SMALL,
      ),
    });

    new Cdn(this, "Cdn", {
      certificate,
      domainNames,
      originDomainName: publicEc2.instance.instancePublicDnsName,
    });

    new cdk.CfnOutput(this, "InstanceId", {
      value: publicEc2.instance.instanceId,
      description:
        "EC2 Instance ID — connect via: aws ssm start-session --target <id>",
    });
  }
}

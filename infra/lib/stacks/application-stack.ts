import * as cdk from "aws-cdk-lib/core";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as targets from "aws-cdk-lib/aws-route53-targets";
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

    const cdn = new Cdn(this, "Cdn", {
      certificate,
      domainNames,
      originDomainName: publicEc2.instance.instancePublicDnsName,
    });

    domainNames.forEach((domainName) => {
      const zone = route53.HostedZone.fromLookup(this, `Zone-${domainName}`, { domainName });
      new route53.ARecord(this, `Alias-${domainName}`, {
        zone,
        recordName: domainName,
        target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(cdn.distribution)),
      });
    });

    new cdk.CfnOutput(this, "InstanceId", {
      value: publicEc2.instance.instanceId,
      description:
        "EC2 Instance ID — connect via: aws ssm start-session --target <id>",
    });
  }
}

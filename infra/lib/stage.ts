import * as cdk from "aws-cdk-lib/core";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import { Construct } from "constructs";
import { PersistentStack, ApplicationStack } from "./stacks";

export interface Environment extends cdk.Environment {
  certificateArn: string;
  domainNames: string[];
}

export interface StageProps extends cdk.StageProps {
  env: Environment;
}

export class Stage extends cdk.Stage {
  constructor(scope: Construct, id: string, props: StageProps) {
    super(scope, id, props);

    const { certificateArn, domainNames } = props.env;

    const { vpc } = new PersistentStack(this, "Persistences", {
      useDefaultVpc: true,
    });

    const certificate = acm.Certificate.fromCertificateArn(
      this,
      "Certificate",
      certificateArn,
    );

    new ApplicationStack(this, "Application", {
      vpc,
      certificate,
      domainNames,
    });
  }
}

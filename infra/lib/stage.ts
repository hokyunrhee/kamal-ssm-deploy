import * as cdk from "aws-cdk-lib/core";
import { Construct } from "constructs";
import { PersistentStack, ApplicationStack } from "./stacks";

export class Stage extends cdk.Stage {
  constructor(scope: Construct, id: string, props?: cdk.StageProps) {
    super(scope, id, props);

    const { vpc } = new PersistentStack(this, "Persistences", {
      useDefaultVpc: true,
    });
    new ApplicationStack(this, "Application", { vpc });
  }
}

import * as cdk from "aws-cdk-lib/core";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as s3 from "aws-cdk-lib/aws-s3";
import { Construct } from "constructs";

export interface PersistentStackProps extends cdk.StackProps {
  useDefaultVpc?: boolean;
}

export class PersistentStack extends cdk.Stack {
  #useDefaultVpc: boolean;
  vpc: ec2.IVpc;
  bucket: s3.Bucket;

  constructor(scope: Construct, id: string, props?: PersistentStackProps) {
    super(scope, id, props);

    const { useDefaultVpc = false } = props || {};

    this.#useDefaultVpc = useDefaultVpc;

    this.vpc = this.#vpc;

    this.bucket = new s3.Bucket(this, "Bucket", {
      bucketName: "re.workingcopy.dev",
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });
  }

  get #vpc() {
    return this.#useDefaultVpc
      ? ec2.Vpc.fromLookup(this, "DefaultVpc", {
          isDefault: true,
        })
      : new ec2.Vpc(this, "Vpc", {
          maxAzs: 1,
          natGateways: 0, // Public subnet only — no NAT Gateway needed
          subnetConfiguration: [
            {
              name: "public",
              subnetType: ec2.SubnetType.PUBLIC,
              cidrMask: 24,
            },
            {
              name: "private",
              subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
              cidrMask: 20,
            },
            {
              name: "isolated",
              subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
              cidrMask: 24,
            },
          ],
        });
  }
}

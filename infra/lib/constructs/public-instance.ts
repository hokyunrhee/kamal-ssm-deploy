import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";
import type * as s3 from "aws-cdk-lib/aws-s3";
import { Construct } from "constructs";

export interface PublicInstanceProps {
  /**
   // VPC where the EC2 instance will be launched (required)
   */
  vpc: ec2.IVpc;
  /**
   // S3 bucket to use for application purposes (optional)
   */
  bucket?: s3.IBucket;
  /**
   * EC2 instance type (optional)
   * Defaults to t3.medium.
   */
  instanceType?: ec2.InstanceType;
  /**
   * Machine image for the EC2 instance (optional)
   * Defaults to latest Amazon Linux 2023.
   */
  machineImage?: ec2.IMachineImage;
}

export class PublicInstance extends Construct {
  public readonly instance: ec2.Instance;
  public readonly securityGroup: ec2.SecurityGroup;

  constructor(scope: Construct, id: string, props: PublicInstanceProps) {
    super(scope, id);
    const {
      vpc,
      bucket,
      instanceType = ec2.InstanceType.of(ec2.InstanceClass.T4G, ec2.InstanceSize.MEDIUM),
      machineImage = ec2.MachineImage.fromSsmParameter(
        "/aws/service/canonical/ubuntu/server/noble/stable/current/arm64/hvm/ebs-gp3/ami-id",
        { os: ec2.OperatingSystemType.LINUX },
      ),
    } = props;

    this.securityGroup = new ec2.SecurityGroup(this, "SecurityGroup", {
      vpc,
      allowAllOutbound: true,
      description: "Hardened Security Group: ingress from CloudFront prefix list only on 443",
    });
    this.securityGroup.addIngressRule(
      ec2.Peer.prefixList(this.cfPrefixList),
      ec2.Port.tcp(443),
      "Allow HTTPS from CloudFront origin-facing IPs only",
    );

    this.instance = new ec2.Instance(this, "Instance", {
      vpc,
      securityGroup: this.securityGroup,
      instanceType,
      machineImage,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PUBLIC,
      },
      httpTokens: ec2.HttpTokens.REQUIRED,
      httpEndpoint: true,
      httpPutResponseHopLimit: 1,
      sourceDestCheck: true,
    });

    this.instance.role.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonSSMManagedInstanceCore"));

    bucket?.grantReadWrite(this.instance.role);
  }

  private get cfPrefixList() {
    const cfPrefixList = ec2.PrefixList.fromLookup(this, "CfPrefixList", {
      prefixListName: "com.amazonaws.global.cloudfront.origin-facing",
    });

    return cfPrefixList.prefixListId;
  }
}

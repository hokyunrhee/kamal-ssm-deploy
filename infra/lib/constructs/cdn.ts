import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import { Construct } from "constructs";

export interface CdnProps {
  /**
   * ACM certificate for the distribution (must be in us-east-1).
   */
  certificate: acm.ICertificate;
  /**
   * Custom domain names to associate with the distribution.
   */
  domainNames: string[];
  /**
   * Origin domain name (e.g. EC2 public DNS).
   */
  originDomainName: string;
}

export class Cdn extends Construct {
  public readonly distribution: cloudfront.Distribution;

  constructor(scope: Construct, id: string, props: CdnProps) {
    super(scope, id);

    const { certificate, domainNames, originDomainName } = props;

    const httpOrigin = new origins.HttpOrigin(originDomainName, {
      protocolPolicy: cloudfront.OriginProtocolPolicy.HTTP_ONLY,
      httpPort: 80,
    });

    this.distribution = new cloudfront.Distribution(this, "Distribution", {
      certificate,
      domainNames,
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
      defaultBehavior: {
        origin: httpOrigin,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
        originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_AND_CLOUDFRONT_2022,
        compress: true,
      },
      enableLogging: false,
    });
  }
}

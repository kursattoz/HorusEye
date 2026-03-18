import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as route53Targets from 'aws-cdk-lib/aws-route53-targets';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';

export interface ServiceStackProps extends cdk.StackProps {
  vpc: ec2.Vpc;
  repository: ecr.Repository;
  domainName: string;
  /** Subdomain prefix (e.g. "staging"). Omit for apex domain. */
  subdomain?: string;
  desiredCount: number;
  cpu: number;
  memoryLimitMiB: number;
}

export class ServiceStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: ServiceStackProps) {
    super(scope, id, props);

    const envName = props.subdomain ?? 'production';
    const fqdn = props.subdomain
      ? `${props.subdomain}.${props.domainName}`
      : props.domainName;

    // ── DNS zone (must already exist in Route53) ─────────────────
    const hostedZone = route53.HostedZone.fromLookup(this, 'Zone', {
      domainName: props.domainName,
    });

    // ── TLS certificate ──────────────────────────────────────────
    const certificate = new acm.Certificate(this, 'Cert', {
      domainName: fqdn,
      validation: acm.CertificateValidation.fromDns(hostedZone),
    });

    // ── ECS cluster ──────────────────────────────────────────────
    const cluster = new ecs.Cluster(this, 'Cluster', {
      vpc: props.vpc,
      containerInsightsV2: ecs.ContainerInsights.ENABLED,
    });

    // ── SSM parameter paths ──────────────────────────────────────
    const ssmPrefix = `/horuseye/${envName}`;

    // ── Task definition ──────────────────────────────────────────
    const taskDef = new ecs.FargateTaskDefinition(this, 'TaskDef', {
      cpu: props.cpu,
      memoryLimitMiB: props.memoryLimitMiB,
    });

    // ── Resolve SSM parameters at deploy time ─────────────────
    const supabaseUrl = ssm.StringParameter.valueFromLookup(this, `${ssmPrefix}/SUPABASE_URL`);
    const supabaseAnonKey = ssm.StringParameter.valueFromLookup(this, `${ssmPrefix}/SUPABASE_ANON_KEY`);
    const supabaseServiceKey = ssm.StringParameter.valueFromLookup(this, `${ssmPrefix}/SUPABASE_SERVICE_ROLE_KEY`);

    const environment: Record<string, string> = {
      NEXT_PUBLIC_ENV: envName,
      NEXT_PUBLIC_CAMERA_MODULE_ENABLED: 'false',
      NODE_ENV: 'production',
      NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: supabaseAnonKey,
      SUPABASE_SERVICE_ROLE_KEY: supabaseServiceKey,
    };

    if (envName === 'production') {
      environment.SENTRY_AUTH_TOKEN = ssm.StringParameter.valueFromLookup(this, `${ssmPrefix}/SENTRY_AUTH_TOKEN`);
      environment.NEXT_PUBLIC_SENTRY_DSN = ssm.StringParameter.valueFromLookup(this, `${ssmPrefix}/SENTRY_DSN`);
    }

    taskDef.addContainer('portal', {
      image: ecs.ContainerImage.fromEcrRepository(props.repository, 'latest'),
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: `horuseye-${envName}`,
        logRetention: logs.RetentionDays.TWO_WEEKS,
      }),
      environment,
      portMappings: [{ containerPort: 3000 }],
    });

    // ── Fargate service ──────────────────────────────────────────
    const service = new ecs.FargateService(this, 'Service', {
      cluster,
      taskDefinition: taskDef,
      desiredCount: props.desiredCount,
      assignPublicIp: true, // No NAT gateway — tasks in public subnets
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      healthCheckGracePeriod: cdk.Duration.seconds(60),
    });

    // ── ALB ──────────────────────────────────────────────────────
    const alb = new elbv2.ApplicationLoadBalancer(this, 'ALB', {
      vpc: props.vpc,
      internetFacing: true,
    });

    // HTTP → HTTPS redirect
    alb.addListener('HttpRedirect', {
      port: 80,
      defaultAction: elbv2.ListenerAction.redirect({
        protocol: 'HTTPS',
        port: '443',
        permanent: true,
      }),
    });

    const httpsListener = alb.addListener('Https', {
      port: 443,
      certificates: [certificate],
    });

    httpsListener.addTargets('EcsTarget', {
      port: 3000,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targets: [service],
      healthCheck: {
        path: '/api/health',
        interval: cdk.Duration.seconds(30),
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 3,
        timeout: cdk.Duration.seconds(10),
      },
    });

    // ── DNS record ───────────────────────────────────────────────
    new route53.ARecord(this, 'DnsRecord', {
      zone: hostedZone,
      recordName: props.subdomain,
      target: route53.RecordTarget.fromAlias(
        new route53Targets.LoadBalancerTarget(alb),
      ),
    });

    // ── Outputs ──────────────────────────────────────────────────
    new cdk.CfnOutput(this, 'Url', { value: `https://${fqdn}` });
    new cdk.CfnOutput(this, 'AlbDns', { value: alb.loadBalancerDnsName });
    new cdk.CfnOutput(this, 'ServiceArn', { value: service.serviceArn });
    new cdk.CfnOutput(this, 'ClusterArn', { value: cluster.clusterArn });
  }
}

#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { NetworkStack } from '../lib/network-stack';
import { RegistryStack } from '../lib/registry-stack';
import { ServiceStack } from '../lib/service-stack';
import { AiServiceStack } from '../lib/ai-service-stack';

const app = new cdk.App();

const domainName = app.node.tryGetContext('domainName') ?? 'horuseye.app';

const env: cdk.Environment = {
  account: app.node.tryGetContext('awsAccount') || process.env.CDK_DEFAULT_ACCOUNT,
  region: app.node.tryGetContext('awsRegion') || process.env.CDK_DEFAULT_REGION,
};

// ── Shared stacks ────────────────────────────────────────────────
const network = new NetworkStack(app, 'HorusEye-Network', { env });

const registry = new RegistryStack(app, 'HorusEye-Registry', { env });

// ── Per-environment service stacks ───────────────────────────────
new ServiceStack(app, 'HorusEye-Staging', {
  env,
  vpc: network.vpc,
  repository: registry.repository,
  domainName,
  subdomain: 'staging',
  desiredCount: 1,
  cpu: 256,
  memoryLimitMiB: 512,
});

new ServiceStack(app, 'HorusEye-Production', {
  env,
  vpc: network.vpc,
  repository: registry.repository,
  domainName,
  subdomain: undefined, // apex domain
  desiredCount: 2,
  cpu: 256,
  memoryLimitMiB: 512,
});

// ── AI service stacks (PRD-019) ──────────────────────────────────
new AiServiceStack(app, 'HorusEye-AiService-Staging', {
  env,
  vpc: network.vpc,
  repository: registry.aiServiceRepository,
  domainName,
  subdomain: 'ai-staging',
  envName: 'staging',
  desiredCount: 1,
  cpu: 1024,            // YOLOv8n on CPU needs the headroom
  memoryLimitMiB: 2048,
});

new AiServiceStack(app, 'HorusEye-AiService-Production', {
  env,
  vpc: network.vpc,
  repository: registry.aiServiceRepository,
  domainName,
  subdomain: 'ai',
  envName: 'production',
  desiredCount: 1,
  cpu: 1024,
  memoryLimitMiB: 2048,
});

import * as cdk from 'aws-cdk-lib';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import { Construct } from 'constructs';

export class RegistryStack extends cdk.Stack {
  public readonly repository: ecr.Repository;
  public readonly aiServiceRepository: ecr.Repository;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    this.repository = new ecr.Repository(this, 'PortalRepo', {
      repositoryName: 'horuseye/portal',
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      lifecycleRules: [
        {
          maxImageCount: 20,
          description: 'Keep last 20 images',
        },
      ],
    });

    // AI service images are 2-3GB each — keep fewer to save storage cost.
    this.aiServiceRepository = new ecr.Repository(this, 'AiServiceRepo', {
      repositoryName: 'horuseye/ai-service',
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      lifecycleRules: [
        {
          maxImageCount: 10,
          description: 'Keep last 10 images',
        },
      ],
    });

    new cdk.CfnOutput(this, 'RepoUri', { value: this.repository.repositoryUri });
    new cdk.CfnOutput(this, 'AiServiceRepoUri', { value: this.aiServiceRepository.repositoryUri });
  }
}

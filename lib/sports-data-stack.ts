import { App, CfnParameter, Duration, Stack, StackProps } from "aws-cdk-lib";
import { SubnetType, Vpc } from "aws-cdk-lib/aws-ec2";
import { Rule, Schedule } from "aws-cdk-lib/aws-events";
import { LambdaFunction } from "aws-cdk-lib/aws-events-targets";
import {
  Effect,
  PolicyDocument,
  PolicyStatement,
  Role,
  ServicePrincipal,
} from "aws-cdk-lib/aws-iam";
import { Code, Function, Runtime } from "aws-cdk-lib/aws-lambda";
import { Topic } from "aws-cdk-lib/aws-sns";
import { EmailSubscription } from "aws-cdk-lib/aws-sns-subscriptions";
import {
  ParameterTier,
  ParameterType,
  StringParameter,
} from "aws-cdk-lib/aws-ssm";
import {
  Choice,
  Condition,
  Pass,
  StateMachine,
  Succeed,
  Wait,
  WaitTime,
} from "aws-cdk-lib/aws-stepfunctions";
import { LambdaInvoke } from "aws-cdk-lib/aws-stepfunctions-tasks";
import * as path from "path";

export class SportsDataStack extends Stack {
  constructor(scope: App, id: string, props?: StackProps) {
    super(scope, id, props);

    const accountId = Stack.of(this).account;
    const region = Stack.of(this).region;
    const appName = "SportsDataPolling";
    const eventBridgeRuleName = "GameDayGameStartRule";

    const emailAddress = new CfnParameter(this, "emailAddress", {
      type: "String",
      description: "The email address that will get score updates.",
    });

    const teamId = new CfnParameter(this, "teamId", {
      type: "String",
      description:
        "Your favorite team id. For full list you can look at the teams file.",
      default: "ef64da7f-cfaf-4300-87b0-9313386b977c",
      allowedValues: [
        "25507be1-6a68-4267-bd82-e097d94b359b",
        "12079497-e414-450a-8bf2-29f91de646bf",
        "75729d34-bca7-4a0f-b3df-6f26c6ad3719",
        "93941372-eb4c-4c40-aced-fe3267174393",
        "55714da8-fcaf-4574-8443-59bfb511a524",
        "47f490cd-2f58-4ef7-9dfd-2ad6ba6c1ae8",
        "c874a065-c115-4e7d-b0f0-235584fb0e6f",
        "80715d0d-0d2a-450f-a970-1b9a3b18c7e7",
        "29dd9a87-5bcc-4774-80c3-7f50d985068b",
        "575c19b7-4052-41c2-9f0a-1c5813d02f99",
        "eb21dadd-8f10-4095-8bf3-dfb3b779f107",
        "833a51a9-0d84-410f-bd77-da08c3e5e26e",
        "4f735188-37c8-473d-ae32-1f7e34ccf892",
        "ef64da7f-cfaf-4300-87b0-9313386b977c",
        "03556285-bdbb-4576-a06d-42f71f46ddc5",
        "dcfd5266-00ce-442c-bc09-264cd20cf455",
        "aa34e0ed-f342-4ec6-b774-c79b47b60e2d",
        "f246a5e5-afdb-479c-9aaa-c68beeda7af6",
        "a09ec676-f887-43dc-bbb3-cf4bbaee9a18",
        "27a59d3b-ff7c-48ea-b016-4798f560f5e1",
        "2142e1ba-3b40-445c-b8bb-f1f8b1054220",
        "481dfe7e-5dab-46ab-a49f-9dcc2b6e2cfd",
        "d52d5339-cbdd-43f3-9dfa-a42fd588b9a3",
        "a7723160-10b7-4277-a309-d8dd95a8ae65",
        "43a39081-52b4-4f93-ad29-da7f329ea960",
        "44671792-dc02-4fdd-a5ad-f5f17edaa9d7",
        "bdc11650-6f74-49c4-875e-778aeb7632d9",
        "d99f919b-1534-4516-8e8a-9cd106c6d8cd",
        "1d678440-b4b1-4954-9b39-70afb3ebbcfa",
        "d89bed32-3aee-4407-99e3-4103641b999a",
      ],
    });

    // Set hit interval in seconds
    const hitIntervalInSeconds = 60; // This is intentionally high due to trial key limitations
    const hitDurationInSeconds = 3 * 60 * 60; // 3 hours * 60 minute * 60 seconds
    // Count will be calculated based on hitDurationInSeconds/hitIntervalInSeconds

    // Set VPC with tow subnets
    // Web Tier: First subnet will be public
    // Application Tier: Second subnet will be private
    const SportDataVPC = new Vpc(this, `${appName}-SportDataVpc`, {
      cidr: "10.0.0.0/16",
      natGateways: 1,
      maxAzs: 2,
      subnetConfiguration: [
        {
          name: "Web Tier",
          subnetType: SubnetType.PUBLIC,
          cidrMask: 24,
        },
        {
          name: "Application Tier",
          subnetType: SubnetType.PRIVATE_WITH_NAT,
          cidrMask: 24,
        },
      ],
    });

    // Add a parameter to systems manager for Api key
    const ApiKey = new StringParameter(this, `${appName}-APIKey`, {
      parameterName: "SportradarApiKey",
      description: "API key to pull data from sportradar.com",
      simpleName: true,
      type: ParameterType.STRING,
      stringValue: "update-this", // This should be updated manually on AWS Console
      tier: ParameterTier.STANDARD,
    });

    // Create an SNS topic to publish game scores
    const scoresTopic = new Topic(this, `${appName}-ScoresTopic`, {
      displayName: "Scores Topic",
    });

    // Add email subscription for the topic
    scoresTopic.addSubscription(
      new EmailSubscription(emailAddress.value.toString())
    );

    // Create an IAM role for the lambda function that will process game data
    const gameDataLambdaRole = new Role(
      this,
      `${appName}-GameDataLambdaIAMRole`,
      {
        assumedBy: new ServicePrincipal("lambda.amazonaws.com"),
        managedPolicies: [
          {
            managedPolicyArn:
              "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole",
          },
          {
            managedPolicyArn:
              "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole",
          },
        ],
        inlinePolicies: {
          PublishMessage: new PolicyDocument({
            statements: [
              new PolicyStatement({
                effect: Effect.ALLOW,
                actions: ["sns:Publish"],
                resources: [scoresTopic.topicArn],
              }),
            ],
          }),
        },
      }
    );

    // The lambda function to process game data
    const gameDataLambda = new Function(this, `${appName}-GameDataLambda`, {
      description:
        "Lambda function that pulls game data for a game from sportradar.com",
      role: gameDataLambdaRole,
      runtime: Runtime.NODEJS_14_X,
      memorySize: 1024,
      timeout: Duration.minutes(1),
      code: Code.fromAsset(path.join(__dirname, "/../src")),
      handler: "game-data-lambda.handler",
      vpc: SportDataVPC,
      vpcSubnets: {
        subnetType: SubnetType.PRIVATE_WITH_NAT,
      },
      environment: {
        REGION: region,
        SCORES_TOPIC: scoresTopic.topicArn,
      },
    });

    // Creating State Machine to Iterate
    const ConfigureCount = new Pass(this, `ConfigureCount`, {
      result: {
        value: {
          index: 0,
          step: 1,
          count: Math.round(hitDurationInSeconds / hitIntervalInSeconds),
          score: 0,
        },
      },
      resultPath: "$.iterator",
    });

    const Iterator = new LambdaInvoke(this, `GameDataTask`, {
      lambdaFunction: gameDataLambda,
      payloadResponseOnly: true,
      retryOnServiceExceptions: false,
      resultPath: "$.iterator",
    });

    const waitState = new Wait(this, `Wait`, {
      time: WaitTime.duration(Duration.seconds(hitIntervalInSeconds)),
    }).next(Iterator);

    const doneState = new Succeed(this, `Done`);

    const IsCountReached = new Choice(this, "IsCountReached", {
      comment: "If the count is reached then end the process",
    })
      .when(
        Condition.stringEquals("$.iterator.continue", "CONTINUE"),
        waitState
      )
      .otherwise(doneState);

    const gameDataStateMachine = new StateMachine(
      this,
      `${appName}-SportsDataStateMachine`,
      {
        stateMachineName: `${appName}-SportsDataStateMachine`,
        definition: ConfigureCount.next(Iterator).next(IsCountReached),
      }
    );

    // Create IAM Role for execution of state machine
    const stepFunctionExecutionRole = new Role(
      this,
      `${appName}-StepFunctionExecutionRole`,
      {
        roleName: `${appName}-StepFunctionExecutionRole`,
        assumedBy: new ServicePrincipal("events.amazonaws.com"),
        inlinePolicies: {
          ExecuteStepFunction: new PolicyDocument({
            statements: [
              new PolicyStatement({
                effect: Effect.ALLOW,
                actions: ["states:StartExecution"],
                resources: [gameDataStateMachine.stateMachineArn],
              }),
            ],
          }),
        },
      }
    );

    // Create an IAM role for the lambda function
    const checkGamesLambdaRole = new Role(
      this,
      `${appName}-CheckGamesLambdaIAMRole`,
      {
        assumedBy: new ServicePrincipal("lambda.amazonaws.com"),
        managedPolicies: [
          {
            managedPolicyArn:
              "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole",
          },
          {
            managedPolicyArn:
              "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole",
          },
        ],
        inlinePolicies: {
          ReadParameterStore: new PolicyDocument({
            statements: [
              new PolicyStatement({
                effect: Effect.ALLOW,
                actions: ["ssm:GetParameter", "ssm:GetParameters"],
                resources: [ApiKey.parameterArn],
              }),
            ],
          }),
          CreateEventBridgeRule: new PolicyDocument({
            statements: [
              new PolicyStatement({
                effect: Effect.ALLOW,
                actions: ["events:PutTargets", "events:PutRule"],
                resources: [
                  `arn:aws:events:${region}:${accountId}:rule/${eventBridgeRuleName}`,
                ],
              }),
            ],
          }),
          IamPassRole: new PolicyDocument({
            statements: [
              new PolicyStatement({
                effect: Effect.ALLOW,
                actions: ["iam:PassRole"],
                resources: [stepFunctionExecutionRole.roleArn],
              }),
            ],
          }),
        },
      }
    );

    // The lambda function to check games every day
    const checkGamesLambda = new Function(this, `${appName}-CheckGamesLambda`, {
      description: "Lambda function that pulls game data from sportradar.com",
      role: checkGamesLambdaRole,
      runtime: Runtime.NODEJS_14_X,
      memorySize: 1024,
      timeout: Duration.minutes(1),
      code: Code.fromAsset(path.join(__dirname, "/../src")),
      handler: "check-games-lambda.handler",
      vpc: SportDataVPC,
      vpcSubnets: {
        subnetType: SubnetType.PRIVATE_WITH_NAT,
      },
      environment: {
        REGION: region,
        EVENT_BRIDGE_RULE: eventBridgeRuleName,
        STATE_MACHINE: gameDataStateMachine.stateMachineArn,
        STATE_MACHINE_EXECUTION_ROLE: stepFunctionExecutionRole.roleArn,
        TEAM_ID: teamId.value.toString(),
      },
    });

    // Creating Event Rule
    const lambdaTarget = new LambdaFunction(checkGamesLambda, {
      retryAttempts: 2,
    });
    const checkGamesScheduleRule = new Rule(
      this,
      `${appName}-CheckGamesScheduleRule`,
      {
        ruleName: `${appName}-CheckGamesScheduleRule`,
        description: "Rule for running Lambda function once every day",
        schedule: Schedule.cron({ minute: "0", hour: "15" }), // 15 GMT -> 8am PDT
      }
    );
    checkGamesScheduleRule.addTarget(lambdaTarget);
  }
}

# Sports Data Polling

This project contains source code and supporting files for the serverless application which polls game data for your favorite MLB team and get notified when your team scores.

This application is based on the AWS Blog <a href="https://aws.amazon.com/blogs/infrastructure-and-automation/automate-sports-data-polling-with-aws-step-functions/" target="_blank">https://aws.amazon.com/blogs/infrastructure-and-automation/automate-sports-data-polling-with-aws-step-functions/</a> and was updated to poll MLB games instead of NHL.
<br/><br/>
For the detailed prerequisites, deployment walkthrough, and validation, please visit the <a href="https://aws.amazon.com/blogs/infrastructure-and-automation/automate-sports-data-polling-with-aws-step-functions/" target="_blank">AWS Blog</a> or the original <a href="https://github.com/aws-samples/aws-step-functions-sports-data-polling" target="_blank">GitHub Repo</a>, but take note of the following changes:

  - Two endpoints that the application is using:
    - <a href="https://developer.sportradar.com/docs/read/baseball/MLB_v7#daily-schedule">Daily Schedule endpoint</a>
    - <a href="https://developer.sportradar.com/docs/read/baseball/MLB_v7#game-boxscore">Game Boxscore endpoint</a>

  - Deployment
    - Use GitHub repository: 
    <a href="https://github.com/heyjoahna/aws-step-functions-sports-data-polling.git" target="_blank">https://github.com/heyjoahna/aws-step-functions-sports-data-polling.git</a>
    - When deploying the AWS CDK application, change the `teamId` to your MLB team. The default id is for Los Angeles Dodgers but you can change it to your favorite MLB team. Find team IDs in `teams-mlb.json`, located in the root directory of this repository. 
      ```js
      cdk deploy --parameters teamId="ef64da7f-cfaf-4300-87b0-9313386b977c" --parameters emailAddress="your email address"
      ```

  - Validation
    - The EventBridge rule that will invoke `check-games-lambda` function once a day will be invoked at 8 AM PT (instead of 9 AM PT).
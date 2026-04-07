# Limonado konkursas

Lemonade competition registration app. Single Lambda function serving an HTML page and handling registrations via DynamoDB.

## Deployment

### 1. DynamoDB table

Create a table in **eu-west-1**:

- **Table name**: `lemonade-registrations`
- **Partition key**: `id` (String)
- Billing mode: on-demand (recommended)

### 2. Lambda function

- **Runtime**: Node.js 24.x
- **Handler**: `index.handler`
- **Architecture**: arm64 (recommended) or x86_64
- Upload `index.mjs` as the function code

### 3. Lambda function URL

Enable a function URL on the Lambda:

- **Auth type**: `NONE` (public access)
- **CORS**: not required (form submits to itself)

### 4. IAM permissions

The Lambda execution role needs the following policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["dynamodb:PutItem", "dynamodb:Scan"],
      "Resource": "arn:aws:dynamodb:eu-west-1:<ACCOUNT_ID>:table/lemonade-registrations"
    }
  ]
}
```

Replace `<ACCOUNT_ID>` with your AWS account ID.

The default `AWSLambdaBasicExecutionRole` managed policy is also needed for CloudWatch logging.

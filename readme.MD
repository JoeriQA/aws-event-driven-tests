# AWS Event Driven Tests

This project is designed an example to facilitate testing of event-driven architectures on AWS. It provides a framework for simulating and validating events to ensure your AWS-based applications behave as expected.

## Features

- Simulate AWS events
- Validate event processing
- Support for various AWS services (e.g., S3, SNS, SQS, Lambda)
- Easy integration with CI/CD pipelines

## Prerequisites

- AWS account
- AWS CLI configured
- Node.js installed

## Installation

Clone the repository and install dependencies:

```bash
git clone https://github.com/yourusername/aws-event-driven-tests.git
cd aws-event-driven-tests
npm install
```

## Usage

1. Configure your AWS credentials. For example with the Leapp application.
2. Define your event scenarios in the `events` directory.
3. Run the tests:

```bash
npm test
```

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

## Contact

For any questions or feedback, please open an issue on GitHub.

export interface BlockDefinition {
    description: string;
}

export interface FunctionDefinition {
    description: string;
    parameters: string[];
    parameterDescriptions: { [key: string]: string };
}

export const validBlocks: { [key: string]: BlockDefinition } = {
    'terraform': { description: `Defines Terraform configurations within a Terragrunt file.

* Use this block to specify Terraform settings, including the source of your Terraform code and any provider configurations.
* You can set the source of your Terraform module, define provider versions, and configure backend settings.

Example:
\`\`\`hcl
terraform {
  source = "git::https://github.com/example/modules.git//networking?ref=v0.13.0"
  
  extra_arguments "common_vars" {
    commands = ["plan", "apply"]
    arguments = ["-var-file=common.tfvars"]
  }
}
\`\`\`` },

    'include': { description: `Includes other Terragrunt configurations, allowing for modular and reusable configurations.

* Use this block to import settings from other Terragrunt files, such as common variables or backend configurations.
* This enables you to maintain DRY (Don't Repeat Yourself) configurations across multiple Terragrunt files.

Example:
\`\`\`hcl
include {
  path = find_in_parent_folders()
}
\`\`\`` },

    'locals': { description: `Defines local variables that can be used throughout the Terragrunt configuration.

* Use this block to declare variables that are specific to the current configuration and can be referenced in other blocks.
* Local variables can help reduce repetition and make your configurations more readable and maintainable.

Example:
\`\`\`hcl
locals {
  env = "prod"
  region = "us-west-2"
  vpc_cidr = "10.0.0.0/16"
}
\`\`\`` },

    'inputs': { description: `Specifies input variables for Terraform modules.

* Use this block to pass variables to the Terraform configuration being used.
* These inputs correspond to the variables defined in your Terraform module.

Example:
\`\`\`hcl
inputs = {
  vpc_cidr = local.vpc_cidr
  environment = local.env
  region = local.region
}
\`\`\`` },

    'dependency': { description: `Declares dependencies on other Terragrunt configurations, ensuring proper execution order.

* Use this block to specify that the current configuration depends on another Terragrunt-managed resource.
* This allows you to reference outputs from dependent modules and ensures that resources are created in the correct order.

Example:
\`\`\`hcl
dependency "vpc" {
  config_path = "../vpc"
  
  mock_outputs = {
    vpc_id = "temporary-dummy-id"
  }
}

inputs = {
  vpc_id = dependency.vpc.outputs.vpc_id
}
\`\`\`` },

    'generate': { description: `Dynamically generates files that can be used in your Terraform configurations.

* Use this block to create files such as backend configurations or provider settings based on your Terragrunt variables.
* Generated files are created before Terraform is run, allowing for dynamic configuration.

Example:
\`\`\`hcl
generate "backend" {
  path = "backend.tf"
  if_exists = "overwrite_terragrunt"
  contents = <<EOF
terraform {
  backend "s3" {
    bucket = "my-terraform-state"
    key    = "\${path_relative_to_include()}/terraform.tfstate"
    region = "us-west-2"
  }
}
EOF
}
\`\`\`` },

    'remote_state': { description: `Configures Terraform remote state storage and retrieval.

* Use this block to set up backend configuration for storing Terraform state files remotely.
* This ensures that your state is stored securely and can be accessed by team members.

Example:
\`\`\`hcl
remote_state {
  backend = "s3"
  config = {
    bucket = "my-terraform-state"
    key    = "\${path_relative_to_include()}/terraform.tfstate"
    region = "us-west-2"
    encrypt = true
  }
}
\`\`\`` },

    'terraform_version_constraint': { description: `Specifies the required Terraform version for the configuration.

* Use this block to ensure that the correct version of Terraform is used when applying the configuration.
* This helps maintain consistency across environments and team members.

Example:
\`\`\`hcl
terraform_version_constraint = ">= 0.13, < 0.14"
\`\`\`` },

    'terragrunt_version_constraint': { description: `Specifies the required Terragrunt version for the configuration.

* Use this block to ensure that the correct version of Terragrunt is used when applying the configuration.
* This helps maintain consistency across environments and team members.

Example:
\`\`\`hcl
terragrunt_version_constraint = ">= 0.23, < 0.24"
\`\`\`` },

    'download_dir': { description: `Specifies the directory for downloaded Terraform configurations.

* Use this block to set a custom location for Terragrunt to store downloaded Terraform modules and plugins.
* This can be useful for managing cache locations or working with air-gapped environments.

Example:
\`\`\`hcl
download_dir = "/tmp/terragrunt_cache"
\`\`\`` },

    'skip': { description: `Skips certain Terragrunt functionality.

* Use this block to bypass specific Terragrunt features when they're not needed or causing issues.
* This can be useful for troubleshooting or in scenarios where you need more control over the Terragrunt workflow.

Example:
\`\`\`hcl
skip = true
\`\`\`` }
};

export const terragruntFunctions: { [key: string]: FunctionDefinition } = {
    'get_env': {
        description: `Retrieves environment variables with an optional default value.

* Returns the value of the environment variable or the default value if not set.
* Useful for incorporating environment-specific values into your Terragrunt configurations.

Example:
\`\`\`hcl
inputs = {
  api_key = get_env("API_KEY", "default-key")
}
\`\`\``,
        parameters: ['ENV_VAR_NAME', 'DEFAULT_VALUE'],
        parameterDescriptions: {
            'ENV_VAR_NAME': 'The name of the environment variable to retrieve',
            'DEFAULT_VALUE': 'The default value to return if the environment variable is not set'
        }
    },
    'get_parent_terragrunt_dir': {
        description: `Gets the parent Terragrunt configuration directory.

* Returns the path to the parent Terragrunt configuration directory.
* Useful for referencing files or configurations in parent directories.

Example:
\`\`\`hcl
include {
  path = "\${get_parent_terragrunt_dir()}/common.hcl"
}
\`\`\``,
        parameters: [],
        parameterDescriptions: {}
    },
    'get_terraform_commands_that_need_vars': {
        description: `Gets Terraform commands that require variables.

* Returns a list of Terraform commands that typically require input variables.
* Useful for conditionally applying configurations based on the Terraform command being run.

Example:
\`\`\`hcl
terraform {
  extra_arguments "conditional_vars" {
    commands  = get_terraform_commands_that_need_vars()
    arguments = ["-var-file=\${get_terragrunt_dir()}/\${get_env("ENV", "dev")}.tfvars"]
  }
}
\`\`\``,
        parameters: [],
        parameterDescriptions: {}
    },
    'get_terraform_commands_that_need_input': {
        description: `Gets Terraform commands that require input.

* Returns a list of Terraform commands that typically require user input.
* Useful for conditionally applying configurations or prompts based on the Terraform command being run.

Example:
\`\`\`hcl
terraform {
  extra_arguments "disable_input" {
    commands  = get_terraform_commands_that_need_input()
    arguments = ["-input=false"]
  }
}
\`\`\``,
        parameters: [],
        parameterDescriptions: {}
    },
    'get_terraform_commands_that_need_locking': {
        description: `Gets Terraform commands that require state locking.

* Returns a list of Terraform commands that typically require state locking.
* Useful for conditionally applying locking configurations based on the Terraform command being run.

Example:
\`\`\`hcl
terraform {
  extra_arguments "disable_locking" {
    commands  = get_terraform_commands_that_need_locking()
    arguments = ["-lock=false"]
  }
}
\`\`\``,
        parameters: [],
        parameterDescriptions: {}
    },
    'get_terraform_commands_that_need_parallelism': {
        description: `Gets Terraform commands that support parallelism.

* Returns a list of Terraform commands that support parallel execution.
* Useful for optimizing performance by applying parallelism settings to supported commands.

Example:
\`\`\`hcl
terraform {
  extra_arguments "parallelism" {
    commands  = get_terraform_commands_that_need_parallelism()
    arguments = ["-parallelism=5"]
  }
}
\`\`\``,
        parameters: [],
        parameterDescriptions: {}
    },
    'path_relative_to_include': {
        description: `Gets the path relative to the including configuration.

* Returns the relative path from the including configuration to the current configuration.
* Useful for generating unique identifiers or paths based on the directory structure.

Example:
\`\`\`hcl
inputs = {
  component_path = path_relative_to_include()
}
\`\`\``,
        parameters: [],
        parameterDescriptions: {}
    },
    'path_relative_from_include': {
        description: `Gets the path from the including configuration.

* Returns the relative path from the current configuration to the including configuration.
* Useful for referencing resources or files relative to the including configuration.

Example:
\`\`\`hcl
locals {
  relative_path = path_relative_from_include()
}
\`\`\``,
        parameters: [],
        parameterDescriptions: {}
    },
    'find_in_parent_folders': {
        description: `Finds files in parent folders.

* Returns the path to the first matching file found in a parent folder, or an error if not found.
* Useful for locating common configuration files in a directory hierarchy.

Example:
\`\`\`hcl
include {
  path = find_in_parent_folders("common.hcl")
}
\`\`\``,
        parameters: ['FILENAME'],
        parameterDescriptions: {
            'FILENAME': 'The name of the file to search for in parent folders'
        }
    },
    'get_terragrunt_dir': {
        description: `Gets the current Terragrunt configuration directory.

* Returns the absolute path to the directory containing the current Terragrunt configuration.
* Useful for referencing files relative to the current configuration.

Example:
\`\`\`hcl
locals {
  config_dir = get_terragrunt_dir()
}
\`\`\``,
        parameters: [],
        parameterDescriptions: {}
    },
    'get_original_terragrunt_dir': {
        description: `Gets the original Terragrunt configuration directory.

* Returns the absolute path to the original directory containing the Terragrunt configuration, before any changes due to includes.
* Useful when working with complex include hierarchies.

Example:
\`\`\`hcl
locals {
  original_config_dir = get_original_terragrunt_dir()
}
\`\`\``,
        parameters: [],
        parameterDescriptions: {}
    },
    'get_terraform_command': {
        description: `Gets the Terraform command being run.

* Returns the current Terraform command being executed (e.g., "plan", "apply").
* Useful for conditionally applying configurations based on the specific Terraform command.

Example:
\`\`\`hcl
locals {
  is_destroy = get_terraform_command() == "destroy"
}
\`\`\``,
        parameters: [],
        parameterDescriptions: {}
    },
    'get_aws_account_id': {
        description: `Gets the AWS account ID.

* Returns the AWS account ID associated with the current AWS credentials.
* Useful for dynamically configuring resources based on the AWS account being used.

Example:
\`\`\`hcl
inputs = {
  account_id = get_aws_account_id()
}
\`\`\``,
        parameters: [],
        parameterDescriptions: {}
    },
    'get_aws_caller_identity_arn': {
        description: `Gets the AWS caller identity ARN.

* Returns the ARN (Amazon Resource Name) of the entity making the AWS API calls.
* Useful for logging, debugging, or setting up fine-grained permissions.

Example:
\`\`\`hcl
locals {
  caller_arn = get_aws_caller_identity_arn()
}
\`\`\``,
        parameters: [],
        parameterDescriptions: {}
    },
    'get_aws_caller_identity_user_id': {
        description: `Gets the AWS caller identity user ID.

* Returns the unique identifier of the entity making the AWS API calls.
* Useful for auditing or setting up user-specific configurations.

Example:
\`\`\`hcl
locals {
  caller_user_id = get_aws_caller_identity_user_id()
}
\`\`\``,
        parameters: [],
        parameterDescriptions: {}
    },
    'get_terraform_cli_args': {
        description: `Gets the Terraform CLI arguments.

* Returns a list of additional CLI arguments passed to the Terraform command.
* Useful for dynamically adjusting Terragrunt behavior based on CLI input.

Example:
\`\`\`hcl
locals {
  extra_args = get_terraform_cli_args()
}
\`\`\``,
        parameters: [],
        parameterDescriptions: {}
    },
    'get_terraform_workspace': {
        description: `Gets the Terraform workspace.

* Returns the name of the current Terraform workspace.
* Useful for applying workspace-specific configurations.

Example:
\`\`\`hcl
inputs = {
  environment = get_terraform_workspace()
}
\`\`\``,
        parameters: [],
        parameterDescriptions: {}
    },
    'run_cmd': {
        description: `Runs a command and returns its output.

* Executes the specified command and returns the output as a string.
* Useful for incorporating external script results or system information into your Terragrunt configurations.

Example:
\`\`\`hcl
locals {
  git_commit = run_cmd("git", "rev-parse", "HEAD")
}
\`\`\``,
        parameters: ['CMD', 'ARGS'],
        parameterDescriptions: {
            'CMD': 'The command to run',
            'ARGS': 'The arguments to pass to the command'
        }
    },
'read_terragrunt_config': {
        description: `Reads a Terragrunt configuration file.

* Returns the parsed contents of the specified Terragrunt configuration file.
* Useful for incorporating configurations from other Terragrunt files.

Example:
\`\`\`hcl
locals {
  common_vars = read_terragrunt_config(find_in_parent_folders("common.hcl"))
}
\`\`\``,
        parameters: ['FILE'],
        parameterDescriptions: {
            'FILE': 'The path to the Terragrunt configuration file to read'
        }
    },
    'sops_decrypt_file': {
        description: `Decrypts a file using SOPS (Secrets OPerationS).

* Returns the decrypted contents of the specified file.
* Useful for securely managing and accessing encrypted configuration files or secrets.

Example:
\`\`\`hcl
locals {
  secrets = yamldecode(sops_decrypt_file("\${get_terragrunt_dir()}/secrets.yaml"))
}

inputs = {
  database_password = local.secrets.database_password
}
\`\`\``,
        parameters: ['FILE'],
        parameterDescriptions: {
            'FILE': 'The path to the file to decrypt using SOPS'
        }
    }
};
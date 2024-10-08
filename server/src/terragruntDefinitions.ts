export interface BlockDefinition {
    description: string;
}

export interface FunctionDefinition {
    description: string;
    parameters: string[];
    parameterDescriptions: { [key: string]: string };
}

export const validBlocks: { [key: string]: BlockDefinition } = {
    'terraform': { description: 'defining Terraform configurations' },
    'include': { description: 'including other Terragrunt configurations' },
    'locals': { description: 'defining local variables' },
    'inputs': { description: 'specifying input variables for Terraform' },
    'dependency': { description: 'declaring dependencies on other Terragrunt configurations' },
    'generate': { description: 'dynamically generating files' },
    'remote_state': { description: 'configuring Terraform remote state' },
    'terraform_version_constraint': { description: 'specifying the required Terraform version' },
    'terragrunt_version_constraint': { description: 'specifying the required Terragrunt version' },
    'download_dir': { description: 'specifying the directory for downloaded Terraform configurations' },
    'skip': { description: 'skipping certain Terragrunt functionality' }
};

export const terragruntFunctions: { [key: string]: FunctionDefinition } = {
    'get_env': {
        description: 'retrieving environment variables',
        parameters: ['ENV_VAR_NAME', 'DEFAULT_VALUE'],
        parameterDescriptions: {
            'ENV_VAR_NAME': 'The name of the environment variable to retrieve',
            'DEFAULT_VALUE': 'The default value to return if the environment variable is not set'
        }
    },
	'get_parent_terragrunt_dir': {
		description: 'getting the parent Terragrunt configuration directory',
		parameters: [],
		parameterDescriptions: {}
	},
    'get_terraform_commands_that_need_vars': {
        description: 'getting Terraform commands that require variables',
        parameters: [],
        parameterDescriptions: {}
    },
    'get_terraform_commands_that_need_input': {
        description: 'getting Terraform commands that require input',
        parameters: [],
        parameterDescriptions: {}
    },
    'get_terraform_commands_that_need_locking': {
        description: 'getting Terraform commands that require state locking',
        parameters: [],
        parameterDescriptions: {}
    },
    'get_terraform_commands_that_need_parallelism': {
        description: 'getting Terraform commands that support parallelism',
        parameters: [],
        parameterDescriptions: {}
    },
    'path_relative_to_include': {
        description: 'getting the path relative to the including configuration',
        parameters: [],
        parameterDescriptions: {}
    },
    'path_relative_from_include': {
        description: 'getting the path from the including configuration',
        parameters: [],
        parameterDescriptions: {}
    },
    'find_in_parent_folders': {
        description: 'finding files in parent folders',
        parameters: ['FILENAME'],
        parameterDescriptions: {
            'FILENAME': 'The name of the file to search for in parent folders'
        }
    },
	'get_terragrunt_dir': {
		description: 'getting the current Terragrunt configuration directory',
		parameters: [],
		parameterDescriptions: {}
	},
	'get_original_terragrunt_dir': {
		description: 'getting the original Terragrunt configuration directory',
		parameters: [],
		parameterDescriptions: {}
	},
	'get_terraform_command': {
		description: 'getting the Terraform command being run',
		parameters: [],
		parameterDescriptions: {}
	},
	'get_aws_account_id': {
		description: 'getting the AWS account ID',
		parameters: [],
		parameterDescriptions: {}
	},
	'get_aws_caller_identity_arn': {
		description: 'getting the AWS caller identity ARN',
		parameters: [],
		parameterDescriptions: {}
	},
	'get_aws_caller_identity_user_id': {
		description: 'getting the AWS caller identity user ID',
		parameters: [],
		parameterDescriptions: {}
	},
	'get_terraform_cli_args': {
		description: 'getting the Terraform CLI arguments',
		parameters: [],
		parameterDescriptions: {}
	},
	'get_terraform_workspace': {
		description: 'getting the Terraform workspace',
		parameters: [],
		parameterDescriptions: {}
	},
	'run_cmd': {
		description: 'running a command',
		parameters: ['CMD', 'ARGS'],
		parameterDescriptions: {
			'CMD': 'The command to run',
			'ARGS': 'The arguments to pass to the command'
		}
	},
	'read_terragrunt_config': {
		description: 'reading a Terragrunt configuration file',
		parameters: ['FILE'],
		parameterDescriptions: {
			'FILE': 'The path to the Terragrunt configuration file to read'
		}
	},
	'sops_decrypt_file': {
		description: 'decrypting a file using SOPS',
		parameters: ['FILE'],
		parameterDescriptions: {
			'FILE': 'The path to the file to decrypt using SOPS'
		}
	}
};
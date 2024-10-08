# Terragrunt HCL Language Server

Language Server Protocol (LSP) server for Terragrunt HCL files. It provides features for Terragrunt configuration files in Visual Studio Code.

## Features

- Valid top-level block declarations.
- Generate and follow link for dependency blocks with relative paths(open the implicit terragrunt.hcl)
- Recognize Heredocs in generate blocks and ignore the content.
- Checking for invalid content outside blocks.
- Number of and type of args after block name(one mandatory string arg for generate and dependecy, an optional string arg for include)
- Mandatory path attribute for include blocks.
- Warning on non-git terraform source paths.
- Reject terraform blocks(module, variable, etc...) in hcl files.
- Some suggestions for remote state and generate blocks and others(WIP)

## Prerequisites

- Node.js (version 12 or higher)
- npm (usually comes with Node.js)

## Installation

1. Clone this repository:

   ```
   git clone https://github.com/jowharshamshiri/tg-hcl-lsp.git
   ```

2. Navigate to the project directory:

   ```
   cd tg-hcl-lsp
   ```

3. Install dependencies:

   ```
   npm install
   ```

## Usage

### As a standalone server

1. Build the project:

   ```
   npm run build
   ```

2. Start the language server:

   ```
   npm start
   ```

### Integration with Visual Studio Code

1. Build the VS Code extension:

   ```
   npm run build:vscode
   ```

2. Copy the built extension to your VS Code extensions folder.

3. Restart VS Code and open a folder containing Terragrunt HCL files.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- This project is built using the [VSCode Language Server Node example](https://github.com/Microsoft/vscode-extension-samples/tree/master/lsp-sample) as a starting point.
- Thanks to the Terragrunt community for inspiration and use cases.

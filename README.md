# Terragrunt HCL Language Server

Language Server Protocol (LSP) server for Terragrunt HCL files. It provides features for Terragrunt configuration files in Visual Studio Code. Install it from vscode [marketplace](https://marketplace.visualstudio.com/items?itemName=BahramJoharshamshiri.hcl-lsp&ssr=false#review-details) or search "Terragrunt Language Server" in vscode extensions panel.

## Features

### Terragrunt.hcl Dependency Tree

- Visualize the dependency tree of Terragrunt configuration files
![Dependency Tree](images/dependency-tree.png)

### Syntax Highlighting and Validation

- Real-time error detection and diagnostics as you type
- Incremental document parsing for better performance

### IntelliSense

- Context-aware code completions
- Trigger completions automatically after typing '.', '=', or space
- Hover information for detailed documentation and type information
- Locals and variables completions
- Dependency completions from terraform outputs

### Document Management

- Full support for document lifecycle (open, change, close)
- Maintains parsed document state for quick access
- Workspace-aware language support

### Error Reporting

- Detailed diagnostic messages for syntax and semantic errors
- Real-time error updates as you edit

### Performance

- Incremental text document synchronization
- Efficient caching of parsed documents
- Optimized for large files and frequent updates

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

4. Build the VS Code extension:

   ```
   npm run compile
   code .
   ```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- Thanks to the Terragrunt community for inspiration and use cases.

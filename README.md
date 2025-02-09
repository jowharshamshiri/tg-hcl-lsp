# Terragrunt HCL Language Server

Language Server Protocol (LSP) server for Terragrunt HCL files. It provides features for Terragrunt configuration files in Visual Studio Code.

## Features

### Syntax Highlighting and Validation

- Real-time error detection and diagnostics as you type
- Incremental document parsing for better performance

### IntelliSense

- Context-aware code completions
- Trigger completions automatically after typing '.', '=', or space
- Hover information for detailed documentation and type information

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

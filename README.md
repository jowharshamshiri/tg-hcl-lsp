[![Version](https://vsmarketplacebadges.dev/version/BahramJoharshamshiri.hcl-lsp.svg)](https://marketplace.visualstudio.com/items?itemName=BahramJoharshamshiri.hcl-lsp)

[![Installs](https://vsmarketplacebadges.dev/installs/BahramJoharshamshiri.hcl-lsp.svg)](https://marketplace.visualstudio.com/items?itemName=BahramJoharshamshiri.hcl-lsp)

[![Rating](https://vsmarketplacebadges.dev/rating/BahramJoharshamshiri.hcl-lsp.svg)](https://marketplace.visualstudio.com/items?itemName=BahramJoharshamshiri.hcl-lsp)

# Terragrunt HCL Language Server

Rich, context-aware editor support for the Terragrunt 1.x configuration model — completions, validation, hover docs, clickable navigation, and a visual lineage graph.

This is a community-supported project. It is not affiliated with Gruntworks, Inc. or the Terragrunt project, but it tracks the official Terragrunt documentation closely and follows the current 1.x regime.

Install **Terragrunt Language Server** from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=BahramJoharshamshiri.hcl-lsp), or build the extension from this repository.

![Terragrunt HCL Language Server](./screenshot.png)

## Features

- **Context-aware completions** for blocks, attributes, functions, locals, dependencies, includes, features, values, units, and stacks
- **File-kind-aware validation** that knows the difference between a unit, an explicit stack, a values file, and an autoinclude — with current-regime diagnostics that flag removed and deprecated syntax
- **Hover documentation** and **clickable document links** for includes, dependencies, and read files
- **Show Terragrunt Lineage Graph** — a visual, interactive graph of the whole workspace covering includes, dependencies, units, nested stacks, and reading lineage, with dependency outputs surfaced from state
- **Syntax highlighting** for Terragrunt blocks, attributes, references, and functions

The lineage graph opens with the first two levels visible, provides filter and expand/collapse controls, preserves the filter between views, uses full-row targets, and reports loading and empty states explicitly. **Open** is shown only for files inside the active workspace.

## What it understands

- `terragrunt.hcl` and named shared unit configurations such as `root.hcl`
- `terragrunt.stack.hcl` explicit stacks
- `terragrunt.values.hcl` generated stack values
- `terragrunt.autoinclude.hcl` and `terragrunt.autoinclude.stack.hcl`

## Getting started

1. Install the extension from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=BahramJoharshamshiri.hcl-lsp).
2. Open any `.hcl` file in a Terragrunt workspace — completions, validation, hover, and links work immediately.
3. Run **Show Terragrunt Lineage Graph** from the Command Palette while an HCL editor is active to see how the units in your workspace include, depend on, and read each other.

## Terragrunt 1.x first

Root configurations should use named includes and explicit filenames:

```hcl
include "root" {
  path = find_in_parent_folders("root.hcl")
}
```

Explicit stacks are recognized through `terragrunt.stack.hcl`:

```hcl
unit "network" {
  source = "../catalog/network"
  path   = "network"
}

unit "app" {
  source = "../catalog/app"
  path   = "app"

  autoinclude {
    dependency "network" {
      config_path = unit.network.path
    }
  }
}
```

The implementation tracks the official Terragrunt [blocks](https://docs.terragrunt.com/reference/hcl/blocks/), [attributes](https://docs.terragrunt.com/reference/hcl/attributes/), [functions](https://docs.terragrunt.com/reference/hcl/functions/), and [stacks](https://docs.terragrunt.com/features/stacks/) documentation.

## Development

Install dependencies and create the extension bundle:

```sh
npm install
npm run webpack
```

For continuous development, rebuild on source changes:

```sh
npm run watch
```

Launch the repository as a VS Code Extension Development Host after bundling it. Test completion, diagnostics, hover, and document links with current Terragrunt HCL files, or open the lineage graph from the Command Palette while an HCL editor is active.

Contributions are welcome — bug reports, feature ideas, and pull requests all help. The parsing and language-service engine is developed separately in [tghclparser](https://github.com/jowharshamshiri/tghclparser) and published as a standalone npm package, so fixes there flow into the extension.

## Thanks

Thanks to everyone who has reported issues, tested, and contributed feedback:

- [and-win](https://github.com/and-win)
- [rtizzy](https://github.com/rtizzy)
- [lucalooz](https://github.com/lucalooz)
- [gsouf](https://github.com/gsouf)
- [jonath92](https://github.com/jonath92)
- [mateothegreat](https://github.com/mateothegreat)
- [prestonr83](https://github.com/prestonr83)
- [jimweller](https://github.com/jimweller)
- [AntonSedna](https://github.com/AntonSedna)
- [vizorich](https://github.com/vizorich)

## License

MIT. See [LICENSE](LICENSE).

This is a community-supported project and is not affiliated with Gruntworks, Inc. or the Terragrunt project. You can support the project by starring it on GitHub or contributing to it. Pull requests are welcome. 

<a href='https://ko-fi.com/I2I51AM5W7' target='_blank'><img height='36' style='border:0px;height:36px;' src='https://storage.ko-fi.com/cdn/kofi6.png?v=6' border='0' alt='Buy Me a Coffee at ko-fi.com' /></a>

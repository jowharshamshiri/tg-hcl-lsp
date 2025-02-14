// script.js
let nodeData = null;

function visualizeTree(data) {
    // Clear any existing SVG
    d3.select("svg").remove();
    nodeData = data;

    const nodeSize = 17;
    const root = d3.hierarchy(data)
        .eachBefore((i => d => d.index = i++)(0));
    const nodes = root.descendants();
    const width = window.innerWidth;
    const height = (nodes.length + 1) * nodeSize;

    // Define columns for additional information
    const columns = [
        {
            label: "Dependencies",
            value: d => d.children ? d.children.length : 0,
            format: value => value.toString(),
            x: width - 200
        },
        {
            label: "Type",
            value: d => d.data.type || "-",
            format: value => value,
            x: width - 100
        }
    ];

    // Create SVG
    const svg = d3.select("body")
        .append("svg")
        .attr("width", width)
        .attr("height", height)
        .attr("viewBox", [-nodeSize / 2, -nodeSize * 3 / 2, width, height])
        .attr("style", "max-width: 100%; height: auto; font: 12px sans-serif; overflow: visible;");

    // Create links
    const link = svg.append("g")
        .attr("fill", "none")
        .attr("stroke", "var(--vscode-editor-foreground)")
        .attr("stroke-opacity", 0.4)
        .selectAll()
        .data(root.links())
        .join("path")
        .attr("d", d => `
            M${d.source.depth * nodeSize},${d.source.index * nodeSize}
            V${d.target.index * nodeSize}
            h${nodeSize}
        `);

    // Create nodes
    const node = svg.append("g")
        .selectAll()
        .data(nodes)
        .join("g")
        .attr("transform", d => `translate(0,${d.index * nodeSize})`);

    // Add circles for nodes
    node.append("circle")
        .attr("cx", d => d.depth * nodeSize)
        .attr("r", 2.5)
        .attr("fill", d => d.children ? "var(--vscode-editor-background)" : "var(--vscode-editor-foreground)")
        .attr("stroke", "var(--vscode-editor-foreground)");

    // Add main text labels
    node.append("text")
        .attr("dy", "0.32em")
        .attr("x", d => d.depth * nodeSize + 6)
        .attr("fill", "var(--vscode-editor-foreground)")
        .text(d => {
            return d.data.name
        })
        .on("click", (event, d) => handleNodeClick(event, d));

    // Add tooltips
    node.append("title")
        .text(d => d.ancestors().reverse().map(d => d.data.name).join("/"));

    // Add column headers and values
    for (const {label, value, format, x} of columns) {
        svg.append("text")
            .attr("dy", "0.32em")
            .attr("y", -nodeSize)
            .attr("x", x)
            .attr("text-anchor", "end")
            .attr("font-weight", "bold")
            .attr("fill", "var(--vscode-editor-foreground)")
            .text(label);

        node.append("text")
            .attr("dy", "0.32em")
            .attr("x", x)
            .attr("text-anchor", "end")
            .attr("fill", d => d.children ? "var(--vscode-editor-foreground)" : "#555")
            .text(d => format(value(d)));
    }
}

function handleNodeClick(event, d) {
    vscode.postMessage({
        type: 'openFile',
        path: d.data.name
    });
}

// Listen for messages from VSCode
window.addEventListener('message', event => {
    const message = event.data;
    switch (message.type) {
        case 'treeData':
            visualizeTree(message.data);
            break;
    }
});

// Handle window resize
window.addEventListener('resize', () => {
    if (nodeData) {
        visualizeTree(nodeData);
    }
});
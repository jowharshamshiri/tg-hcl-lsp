let nodeData = null;

function expandAll() {
	if (!nodeData) return;
	
	function expand(node) {
		if (node._children) {
			node.children = node._children;
			node._children = null;
			node.expanded = true;
			node.children.forEach(expand);
		}
		if (node.children) {
			node.children.forEach(expand);
		}
	}
	
	expand(nodeData);
	visualizeTree(nodeData);
}

function collapseAll() {
	if (!nodeData) return;
	
	function collapse(node) {
		if (node.children) {
			node._children = node.children;
			node.children = null;
			node.expanded = false;
			node._children.forEach(collapse);
		}
	}
	
	// Don't collapse the root node
	if (nodeData.children) {
		nodeData.children.forEach(collapse);
	}
	visualizeTree(nodeData);
}

function visualizeTree(data) { 
    // Clear any existing SVG and error messages
    d3.select("svg").remove(); 
    d3.select("#error-message").remove();
    if (!data) {
        displayError("No dependency tree data available. The tree might be empty or there could be an error in the configuration.");
        return;
    }
    if (!data.name) {
        displayError("The dependency tree is empty. Check your Terragrunt configuration files.");
        return;
    }
    nodeData = data;
    
    const nodeSize = 17;
    const maxLabelLength = 70;
    
    const root = d3.hierarchy(data)
        .eachBefore(((i) => d => d.index = i++)(0));
	
	// Filter out output nodes without children
	const nodes = root.descendants()
        .filter(d => !(d.data.type.startsWith('output') && (!d.data.children && !d.data._children)));
    
    const width = window.innerWidth;
    const height = (nodes.length + 1) * nodeSize;
    
    // Determine if node is expandable
    const isExpandable = (d) => {
        return d.data.type === 'include' || 
               d.data.type === 'dependency' || 
               (d.data.type.startsWith('output') && (d.data.children || d.data._children));
    };
    
    const svg = d3.select("body")
        .append("svg")
        .attr("width", width)
        .attr("height", height)
        .attr("viewBox", [-nodeSize / 2, -nodeSize * 3 / 2, width, height])
        .attr("style", "max-width: 100%; height: auto; font: 12px sans-serif; overflow: visible;");
    
    // Create links
    svg.append("g")
        .attr("fill", "none")
        .attr("stroke", "var(--vscode-editor-foreground)")
        .attr("stroke-opacity", 0.4)
        .selectAll()
        .data(root.links().filter(d => nodes.includes(d.target)))
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
    
    // Node circles with plus/minus signs
    const nodeGroup = node.append("g")
        .attr("transform", d => `translate(${d.depth * nodeSize}, 0)`);

    nodeGroup.append("circle")
        .attr("r", 3.5)
        .attr("fill", d => ((d.children && d.children.length > 0 && d.expanded) || (d.data._children && d.data._children.length > 0 && !d.expanded)) ?
		 "var(--vscode-editor-foreground)" : "var(--vscode-editor-background)")
        .attr("stroke", "var(--vscode-editor-foreground)");

    // Main text labels
    const labelGroup = node.append("g")
        .attr("transform", d => `translate(${d.depth * nodeSize + 6}, 0)`);
		labelGroup.append("text")
		.attr("class", d => {
			const classes = ["node-text"];
			if (isExpandable(d)) classes.push("clickable");
			if (d.data.type.startsWith('output')) classes.push("output-node");
			return classes.join(" ");
		})
		.attr("dy", "0.32em")
		.text(d => {
			const name = d.data.name;
			if (!d.data.type.startsWith('output')) {
				// Find this node's position among its parent's non-output children
				const siblings = d.parent ? d.parent.children : [d];
				const nonOutputSiblings = siblings.filter(node => !node.data.type.startsWith('output'));
				const index = nonOutputSiblings.indexOf(d) + 1;
				return `${index}. ${name.length > maxLabelLength ? name.slice(0, maxLabelLength) + "..." : name}`;
			}
			return name.length > maxLabelLength ? name.slice(0, maxLabelLength) + "..." : name;
		})
		.on("click", (event, d) => {
			if (isExpandable(d)) {
				handleNodeClick(event, d);
			}
		});

    // Add "open file" link only for non-output nodes
    labelGroup.append("text")
        .attr("class", "file-link")
        .attr("dy", "0.32em")
        .attr("x", d => {
            const truncatedLength = Math.min(d.data.name.length, maxLabelLength);
            return truncatedLength * 6 + 10;
        })
        .style("display", d => d.data.type.startsWith('output') ? "none" : null)
        .text("↗")
        .on("click", (event, d) => {
            event.stopPropagation();
            vscode.postMessage({
                type: 'openFile',
                path: d.data.name
            });
        });
    
    // Tooltips for full path
    node.append("title")
        .text(d => d.data.name);
    
	
}

function displayError(message) {
    d3.select("body")
        .append("div")
        .attr("id", "error-message")
        .html(`
            <div class="error-icon">
                <svg height="32" style="overflow:visible;enable-background:new 0 0 32 32" viewBox="0 0 32 32" width="32" xml:space="preserve" xmlns="http://www.w3.org/2000/svg"><g><g id="Error_1_"><g id="Error"><circle cx="16" cy="16" id="BG" r="16" style="fill:#D72828;"/><path d="M14.5,25h3v-3h-3V25z M14.5,6v13h3V6H14.5z" id="Exclamatory_x5F_Sign" style="fill:#E6E6E6;"/></g></g></g></svg>
            </div>
            <p>${message}</p>
        `);
}

function handleNodeClick(event, d) { 
    if (d.data.children) { 
        d.data._children = d.data.children; 
        d.data.children = null; 
		d.expanded = false;
    } else if (d.data._children) { 
        d.data.children = d.data._children; 
        d.data._children = null; 
		d.expanded = true;
    } 
    visualizeTree(nodeData);
}

// Listen for messages from VSCode
window.addEventListener('message', event => { 
    const message = event.data; 
    if (message.type === 'treeData') { 
        visualizeTree(message.data); 
    } 
});

// Handle window resize
window.addEventListener('resize', () => { 
    if (nodeData) { 
        visualizeTree(nodeData); 
    } 
});
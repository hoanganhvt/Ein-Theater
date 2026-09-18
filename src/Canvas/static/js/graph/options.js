export function createNetworkOptions() {
    return {
            manipulation: {
                enabled: false
            },
            interaction: {
                dragNodes: true,
                dragView: true,
                zoomView: true,
                hover: true,
                multiselect: true,
                selectConnectedEdges: false
            },
            physics: { enabled: false },
            nodes: {
                shape: 'box',
                margin: 12,
                font: { size: 14, color: '#1a202c', face: 'Inter' },
                borderWidth: 1.5,
                color: {
                    background: '#ffffff',
                    border: '#4a5568',
                    highlight: { background: '#edf2f7', border: '#007acc' }
                },
                shadow: { enabled: true, color: 'rgba(0,0,0,0.08)', size: 6, x: 2, y: 2 }
            },
            edges: {
                // Keep Vis.js native edges completely invisible (opacity: 0, inherit: false).
                // All visual traces are drawn as sharp orthogonal circuit lines by circuit.js.
                width: 10,
                selectionWidth: 0,
                hoverWidth: 0,
                color: {
                    color: 'rgba(0,0,0,0)',
                    highlight: 'rgba(0,0,0,0)',
                    hover: 'rgba(0,0,0,0)',
                    inherit: false,
                    opacity: 0
                },
                smooth: false,
                arrows: { to: { enabled: false } }
            }
        };
}

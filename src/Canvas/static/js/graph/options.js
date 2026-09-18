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
                font: { size: 14, color: '#d8dce2', face: 'Inter' },
                borderWidth: 1,
                color: {
                    background: '#20242a',
                    border: '#505a68',
                    highlight: { background: '#2b3340', border: '#aabbd8' }
                },
                shadow: { enabled: false }
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

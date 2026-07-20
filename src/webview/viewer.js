const vscode = acquireVsCodeApi(); 
let instances = []; 
let currentState = 0; 
let traceLen = 0;
let loopLen = 0;
const relationColors = ["red", "brown", "orange", "green", "blue", "purple", "pink", "gray"];
const IGNORED_SIGS = new Set(['String', 'Int', 'seq/Int', 'univ', 'none']);

document.getElementById('btn-graph').addEventListener('click', () => setViewMode('graph'));
document.getElementById('btn-xml').addEventListener('click', () => setViewMode('xml'));
document.getElementById('timeline-svg').addEventListener('click', (event) => {
    const target = event.target;
    if (target.hasAttribute('data-index')) {
        const i = parseInt(target.getAttribute('data-index'), 10);
        setState(i);
    }
});

window.addEventListener('message', event => {
    const message = event.data;
    if (message.type === 'loadXmlInstance') {
        document.getElementById('xml-content').textContent = message.xml;
        parseAlloyTrace(message.xml);
    }
});

vscode.postMessage({ type: 'ready' });

function setViewMode(mode) {
    document.getElementById('btn-graph').className = mode === 'graph' ? 'active' : '';
    document.getElementById('btn-xml').className = mode === 'xml' ? 'active' : '';
    document.getElementById('graph-view').style.display = mode === 'graph' ? 'flex' : 'none';
    document.getElementById('xml-view').style.display = mode === 'xml' ? 'block' : 'none';
    const isTrace = instances.length > 0 && instances[0].hasAttribute('tracelength');
    document.getElementById('timeline').style.display = (mode === 'graph' && isTrace) ? 'flex' : 'none';
}

function parseAlloyTrace(xmlText) {
    const xmlDoc = new DOMParser().parseFromString(xmlText, "text/xml");
    instances = Array.from(xmlDoc.getElementsByTagName('instance'));
    if (instances.length === 0) {
        document.getElementById('graph-canvas').innerText = "No instances found in xml output";
        return;
    }

    traceLen = parseInt(instances[0].getAttribute('tracelength')) || instances.length;
    loopLen = parseInt(instances[0].getAttribute('looplength')) || 0;
    currentState = 0;

    if (instances[0].hasAttribute('tracelength')) {
        document.getElementById('timeline').style.display = 'flex';
        drawTimeline();
    }

    renderCurrentState();
}
function drawTimeline() {
    const svg = document.getElementById('timeline-svg');
    let html = '';
    const spacing = 40, radius = 12, y = 30;
    svg.setAttribute('width', traceLen * spacing + 40);

    for (let i = 0; i < traceLen - 1; i++) {
        html += `<line x1="${20 + i * spacing + radius}" y1="${y}" x2="${20 + (i + 1) * spacing - radius}" y2="${y}" stroke="black" stroke-width="2" marker-end="url(#arrow)"/>`;
    }

    if (loopLen > 0 && traceLen >= loopLen) {
        const xEnd = 20 + (traceLen - 1) * spacing;
        const xStart = 20 + (traceLen - loopLen) * spacing;
        if (xEnd === xStart) {
            html += `<path d="M ${xEnd+5},${y-radius} C ${xEnd+20},${y-30} ${xEnd-20},${y-30} ${xEnd-5},${y-radius}" fill="none" stroke="black" stroke-width="2" marker-end="url(#arrow)"/>`;
        } else {
            html += `<path d="M ${xEnd},${y-radius} Q ${(xEnd+xStart)/2},${y-40} ${xStart},${y-radius}" fill="none" stroke="black" stroke-width="2" marker-end="url(#arrow)"/>`;
        }
    }

    for (let i = 0; i < traceLen; i++) {
        const cx = 20 + i * spacing;
        const isCurrent = i === currentState;
        html += `<circle cx="${cx}" cy="${y}" r="${radius}" fill="${isCurrent ? 'gray' : 'white'}" stroke="black" stroke-width="2" style="cursor:pointer;" data-index="${i}"/>`;
        html += `<text x="${cx}" y="${y+4}" font-size="11" font-weight="bold" text-anchor="middle" fill="${isCurrent ? 'white' : 'black'}" style="cursor:pointer;" data-index="${i}">${i}</text>`;
    }

    svg.innerHTML = `<defs><marker id="arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="black"/></marker></defs>` + html;
}

function setState(i) {
    currentState = i;
    drawTimeline();
    renderCurrentState();
}

function renderCurrentState() {
    if (!instances[currentState]) return;
    const inst = instances[currentState];
    
    let nodes = {}; 
    let edges = []; 
    let relCounts = {};
    let colorMap = {};
    let colorIdx = 0;

    function getColor(label) {
        if (!colorMap[label]) {
            colorMap[label] = relationColors[colorIdx % relationColors.length];
            colorIdx++;
        }
        return colorMap[label];
    }

    const sigs = inst.getElementsByTagName('sig');
    for (let i = 0; i < sigs.length; i++) {
        const sigLabel = sigs[i].getAttribute('label');
        if (IGNORED_SIGS.has(sigLabel))
            continue;

        const atoms = sigs[i].getElementsByTagName('atom');
        for (let j = 0; j < atoms.length; j++) {
            nodes[atoms[j].getAttribute('label')] = { skolems: []};
        }
    }

    function parseRelations(elements, isSkolem) {
        for(let i = 0; i < elements.length; i++) {
            const label = elements[i].getAttribute('label');
            const style = (elements[i].getAttribute('var') === 'yes') ? "dashed" : "solid";
            const tuples = elements[i].getElementsByTagName('tuple');

            for(let j = 0; j < tuples.length; j++) {
                const atoms = tuples[j].getElementsByTagName('atom');

                if (isSkolem && atoms.length === 1) {
                    const target = atoms[0].getAttribute('label');
                    if (nodes[target])
                        nodes[target].skolems.push(label);
                } else if (atoms.length >= 2) {
                    const from = atoms[0].getAttribute('label');
                    const to = atoms[atoms.length-1].getAttribute('label');

                    if (nodes[from] && nodes[to]) {
                        let edge = label;
                        if (atoms.length > 2) {
                            let intermediate = [];
                            for(let k = 1; k < atoms.length - 1; k++) {
                                intermediate.push(atoms[k].getAttribute('label'));
                            }
                            edge += " [" + intermediate.join(', ') + "]";
                        }

                        edges.push({ from, to, label: edge, color: getColor(label), style: style });

                        if(!relCounts[label])
                            relCounts[label] = { count: 0, color: getColor(label) };
                        relCounts[label].count++;
                    }
                }
            }
        }
    }

    parseRelations(inst.getElementsByTagName('skolem'), true);
    parseRelations(inst.getElementsByTagName('field'), false);

    let inDegree = {};

    for (let n in nodes) inDegree[n] = 0;

    edges.forEach(e => {
        if (e.from !== e.to) inDegree[e.to]++;
    });

    let dot = `digraph G {\
      graph [rankdir=TB, bgcolor="white", pad="0.5", nodesep="0.6", ranksep="0.6"];\
      node [shape=box, style=filled, fillcolor="yellow", fontcolor="black", fontname="Helvetica", fontsize=12];\
      edge [fontname="Helvetica", fontsize=12];\
    `;

    for (let atom in nodes) {
        let labelText = atom;
        if (nodes[atom].skolems.length > 0) labelText += '\\n(' + nodes[atom].skolems.join(', ') + ')';
        dot += '  "' + atom + '" ' + '[label="' + labelText + '"];\n';
    }

    edges.forEach(e => {
        let dotFrom = e.from;
        let dotTo = e.to;
        let dir = "forward";

        // swap so nodes with smaller in-degrees stay at the top
        if (inDegree[e.from] > inDegree[e.to] || (inDegree[e.from] === inDegree[e.to] && e.from > e.to)) {
            dotFrom = e.to;
            dotTo = e.from;
            dir = "back";
        }

        dot += '  "' + dotFrom + '" -> "' + dotTo + '" [label="' + e.label + '", color="' + e.color + '", fontcolor="' + e.color + '", style="' + e.style + '", dir="' + dir + '"];\n';
    });
    dot += '}\n';

    const container = document.getElementById('graph-canvas');
    if(typeof Viz === 'undefined') return;
    
    new Viz().renderSVGElement(dot)
        .then(function(element) {
            container.innerHTML = "";
            container.appendChild(element);
            
            const legend = document.getElementById('legend');

            if (Object.keys(relCounts).length === 0) {
                legend.style.display = 'none';
            } else {
                let lHtml = '<table>';
                for (let rawRel in relCounts) {
                    lHtml += `<tr><td style="color:${relCounts[rawRel].color}; font-weight:bold;">${rawRel}:</td><td>${relCounts[rawRel].count}</td></tr>`;
                }
                legend.innerHTML = lHtml + '</table>';
                legend.style.display = 'block';
            }
        })
        .catch(error => {
            container.innerText = "Graphviz compilatio error: " + error.message;
        });
}
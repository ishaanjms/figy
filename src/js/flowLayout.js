window.FigyLayout = {
  async arrange(plan) {
    FigyGraph.validate(plan);
    const children = plan.nodes.map((node) => ({
      id: node.id,
      width: /decision|choice/.test(node.type) ? 300 : 260,
      height: Math.max(/decision|choice/.test(node.type) ? 150 : 100, 50 + Math.ceil((node.label.length + (node.detail || "").length) / 28) * 19),
      ports: []
    }));
    const byId = new Map(children.map(node => [node.id, node]));
    const edges = plan.connections.map((edge, i) => {
      const from = "edge-" + i + "-from";
      const to = "edge-" + i + "-to";
      byId.get(edge.from).ports.push({ id: from, width: 1, height: 1 });
      byId.get(edge.to).ports.push({ id: to, width: 1, height: 1 });
      return { id: "edge-" + i, sources: [from], targets: [to], labels: edge.label ? [{ text: edge.label, width: Math.min(240, edge.label.length * 7 + 12), height: 24 }] : [] };
    });
    const layout = await new ELK().layout({ id: "flow", layoutOptions: {
      "elk.algorithm": "layered", "elk.direction": "DOWN", "elk.edgeRouting": "ORTHOGONAL",
      "elk.spacing.nodeNode": "65", "elk.layered.spacing.nodeNodeBetweenLayers": "90",
      "elk.spacing.edgeNode": "25", "elk.spacing.edgeEdge": "18"
    }, children, edges });
    // Attach ports to the visible ellipse/diamond boundary, preserving unique anchors.
    const portPoints = new Map();
    layout.children.forEach(position => {
      const node = plan.nodes.find(n => n.id === position.id);
      position.ports.forEach(port => {
        let u=(port.x+.5)/position.width-.5, v=(port.y+.5)/position.height-.5;
        const radius=/decision|choice/.test(node.type) ? Math.abs(u)+Math.abs(v) : /start|end|finish/.test(node.type) ? Math.hypot(u,v) : .5;
        const factor=radius ? .5/radius : 1;
        port.x=(.5+u*factor)*position.width-.5;
        port.y=(.5+v*factor)*position.height-.5;
        portPoints.set(port.id,{x:position.x+port.x+.5,y:position.y+port.y+.5});
      });
    });
    layout.edges.forEach(edge=>{
      const section=edge.sections?.[0];if(!section)return;
      section.bendPoints=[section.startPoint,...(section.bendPoints||[]),section.endPoint];
      section.startPoint=portPoints.get(edge.sources[0]);
      section.endPoint=portPoints.get(edge.targets[0]);
    });
    return { ...plan, layout };
  }
};

"""
Topological Sorting Module for Computational Graphs.

Provides Kahn's algorithm implementation to establish causal topological ordering
from input placeholder nodes to output nodes.
"""

from collections import deque
from typing import List, Dict, Any, Tuple


def topological_sort(nodes: List[Dict[str, Any]]) -> Tuple[List[Dict[str, Any]], bool]:
    """
    Performs Kahn's algorithm to topologically sort computational graph nodes.
    Supports unique node IDs as well as sequential variable updates (e.g. assign followed by accumulate).

    Args:
        nodes: List of node dictionaries, each having 'id' and optionally 'inputs'.

    Returns:
        Tuple of (ordered_nodes, has_cycle_flag).
        - ordered_nodes: Nodes sorted so every node appears after all its dependencies.
        - has_cycle_flag: True if a cyclic dependency was detected, False otherwise.
    """
    n_count = len(nodes)
    if n_count <= 1:
        return list(nodes), False

    # Track definition sites for variable names: variable_name -> list of defining node indices
    var_defs: Dict[str, List[int]] = {}
    for idx, node in enumerate(nodes):
        nid = str(node.get('id', ''))
        var_defs.setdefault(nid, []).append(idx)
        target = node.get('target')
        if target and str(target) != nid:
            var_defs.setdefault(str(target), []).append(idx)

    # Build dependency graph between node indices 0..n_count-1
    in_degree = [0] * n_count
    dependents: Dict[int, List[int]] = {i: [] for i in range(n_count)}

    for idx, node in enumerate(nodes):
        inputs = node.get('inputs', [])
        for inp in inputs:
            inp_str = str(inp)
            defs = var_defs.get(inp_str, [])
            # Pick the most recent definition prior to idx, or the primary definition if none prior
            prior_defs = [d for d in defs if d < idx]
            def_idx = prior_defs[-1] if prior_defs else (defs[0] if defs and defs[0] != idx else None)

            if def_idx is not None and def_idx != idx:
                if idx not in dependents[def_idx]:
                    dependents[def_idx].append(idx)
                    in_degree[idx] += 1

    queue = deque([i for i, deg in enumerate(in_degree) if deg == 0])
    ordered_indices: List[int] = []

    while queue:
        u = queue.popleft()
        ordered_indices.append(u)
        for v in dependents[u]:
            in_degree[v] -= 1
            if in_degree[v] == 0:
                queue.append(v)

    has_cycle = len(ordered_indices) < n_count
    if has_cycle:
        visited = set(ordered_indices)
        for i in range(n_count):
            if i not in visited:
                ordered_indices.append(i)

    return [nodes[i] for i in ordered_indices], has_cycle

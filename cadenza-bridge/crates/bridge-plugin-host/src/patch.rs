//! RFC 6902-style JSON Patch application against a live `Graph` or against
//! a `Project` (the latter is what the network thread uses so it can rebuild
//! the audio graph from a single source of truth).
//!
//! Phase 3 supports the subset documented in the epic; unknown paths return
//! an error rather than silently ignoring (so the frontend always finds out
//! when its assumptions diverge from the bridge).

use crate::graph::{Bus, EffectNode, Graph, Send};
use bridge_protocol::{
    AutomationSpec, BusState, ChainNodeSpec, JsonPatchOp, Project, SendSpec,
};

/// Apply a sequence of JSON Patch ops to the graph in order. The first op
/// that fails aborts the batch (but already-applied ops remain in place).
pub fn apply_patch(graph: &mut Graph, ops: &[JsonPatchOp]) -> anyhow::Result<usize> {
    let mut applied = 0;
    let mut topo_dirty = false;
    for op in ops {
        apply_one(graph, op).map_err(|e| {
            anyhow::anyhow!("patch op {} on {} failed: {e}", op.op, op.path)
        })?;
        applied += 1;
        if op.path.starts_with("/buses") || op.path.contains("/sends") {
            topo_dirty = true;
        }
    }
    if topo_dirty {
        graph.recompute_bus_order()?;
    }
    Ok(applied)
}

fn apply_one(graph: &mut Graph, op: &JsonPatchOp) -> anyhow::Result<()> {
    let segments = parse_path(&op.path);
    if segments.is_empty() {
        return Err(anyhow::anyhow!("empty path"));
    }
    match segments[0].as_str() {
        "tracks" => apply_track(graph, &segments[1..], op),
        "buses" => apply_bus(graph, &segments[1..], op),
        "master" => apply_master(graph, &segments[1..], op),
        other => Err(anyhow::anyhow!("unsupported path root: /{other}")),
    }
}

fn apply_track(graph: &mut Graph, segs: &[String], op: &JsonPatchOp) -> anyhow::Result<()> {
    if segs.is_empty() {
        return Err(anyhow::anyhow!("missing track id"));
    }
    let track_id = &segs[0];
    let ti = graph
        .track_index(track_id)
        .ok_or_else(|| anyhow::anyhow!("unknown track id: {track_id}"))?;

    if segs.len() == 1 {
        // Whole-track replace not supported in Phase 3.
        return Err(anyhow::anyhow!("whole-track replace not supported"));
    }

    let field = segs[1].as_str();
    match field {
        "volumeDb" => {
            let v = require_value(op)?.as_f64().ok_or_else(|| anyhow::anyhow!("expected number"))?;
            graph.tracks[ti].volume_db = v;
        }
        "pan" => {
            let v = require_value(op)?.as_f64().ok_or_else(|| anyhow::anyhow!("expected number"))?;
            graph.tracks[ti].pan = v;
        }
        "mute" => {
            let v = require_value(op)?.as_bool().ok_or_else(|| anyhow::anyhow!("expected bool"))?;
            graph.tracks[ti].mute = v;
        }
        "solo" => {
            let v = require_value(op)?.as_bool().ok_or_else(|| anyhow::anyhow!("expected bool"))?;
            graph.tracks[ti].solo = v;
        }
        "inserts" => apply_track_inserts(graph, ti, &segs[2..], op)?,
        "sends" => apply_track_sends(graph, ti, &segs[2..], op)?,
        "automation" => apply_track_automation(graph, ti, &segs[2..], op)?,
        other => return Err(anyhow::anyhow!("unsupported track field: {other}")),
    }
    Ok(())
}

fn apply_track_inserts(
    graph: &mut Graph,
    ti: usize,
    rest: &[String],
    op: &JsonPatchOp,
) -> anyhow::Result<()> {
    if rest.is_empty() {
        return Err(anyhow::anyhow!("inserts requires sub-path"));
    }
    let head = rest[0].as_str();
    if head == "-" {
        // Append a node.
        let value = require_value(op)?;
        let spec: ChainNodeSpec = serde_json::from_value(value.clone())?;
        let node = EffectNode::from_spec(&spec)
            .ok_or_else(|| anyhow::anyhow!("unsupported plugin: {}", spec.plugin.uid))?;
        graph.tracks[ti].inserts.push(node);
        return Ok(());
    }
    // /tracks/{tid}/inserts/{node_id}/...
    let node_id = head;
    if rest.len() == 1 {
        match op.op.as_str() {
            "remove" => {
                let before = graph.tracks[ti].inserts.len();
                graph.tracks[ti].inserts.retain(|n| n.id != node_id);
                if graph.tracks[ti].inserts.len() == before {
                    return Err(anyhow::anyhow!("unknown insert id: {node_id}"));
                }
                return Ok(());
            }
            _ => return Err(anyhow::anyhow!("only 'remove' supported on insert path")),
        }
    }
    if rest.len() >= 3 && rest[1] == "params" {
        let param_id = rest[2].as_str();
        let v = require_value(op)?.as_f64().ok_or_else(|| anyhow::anyhow!("expected number"))?;
        let node = graph.tracks[ti]
            .inserts
            .iter_mut()
            .find(|n| n.id == node_id)
            .ok_or_else(|| anyhow::anyhow!("unknown insert id: {node_id}"))?;
        node.effect.set_param(param_id, v);
        return Ok(());
    }
    if rest.len() >= 2 && rest[1] == "bypass" {
        let v = require_value(op)?.as_bool().ok_or_else(|| anyhow::anyhow!("expected bool"))?;
        let node = graph.tracks[ti]
            .inserts
            .iter_mut()
            .find(|n| n.id == node_id)
            .ok_or_else(|| anyhow::anyhow!("unknown insert id: {node_id}"))?;
        node.bypass = v;
        return Ok(());
    }
    Err(anyhow::anyhow!("unsupported insert sub-path: {}", rest.join("/")))
}

fn apply_track_sends(
    graph: &mut Graph,
    ti: usize,
    rest: &[String],
    op: &JsonPatchOp,
) -> anyhow::Result<()> {
    if rest.is_empty() {
        return Err(anyhow::anyhow!("sends requires sub-path"));
    }
    let head = rest[0].as_str();
    if head == "-" {
        let value = require_value(op)?;
        let spec: SendSpec = serde_json::from_value(value.clone())?;
        graph.tracks[ti].sends.push(Send::from(&spec));
        return Ok(());
    }
    let send_id = head;
    if rest.len() == 1 {
        if op.op == "remove" {
            let before = graph.tracks[ti].sends.len();
            graph.tracks[ti].sends.retain(|s| s.id != send_id);
            if graph.tracks[ti].sends.len() == before {
                return Err(anyhow::anyhow!("unknown send id: {send_id}"));
            }
            return Ok(());
        }
        return Err(anyhow::anyhow!("only 'remove' supported on send path"));
    }
    let field = rest[1].as_str();
    let send = graph.tracks[ti]
        .sends
        .iter_mut()
        .find(|s| s.id == send_id)
        .ok_or_else(|| anyhow::anyhow!("unknown send id: {send_id}"))?;
    match field {
        "level" => {
            let v = require_value(op)?
                .as_f64()
                .ok_or_else(|| anyhow::anyhow!("expected number"))?;
            send.level = v as f32;
        }
        "pre" => {
            let v = require_value(op)?
                .as_bool()
                .ok_or_else(|| anyhow::anyhow!("expected bool"))?;
            send.pre_fader = v;
        }
        "destBusId" => {
            let v = require_value(op)?
                .as_str()
                .ok_or_else(|| anyhow::anyhow!("expected string"))?;
            send.dest_bus_id = v.to_string();
        }
        other => return Err(anyhow::anyhow!("unsupported send field: {other}")),
    }
    Ok(())
}

fn apply_track_automation(
    graph: &mut Graph,
    ti: usize,
    rest: &[String],
    op: &JsonPatchOp,
) -> anyhow::Result<()> {
    if rest.is_empty() {
        return Err(anyhow::anyhow!("automation requires sub-path"));
    }
    let head = rest[0].as_str();
    if head == "-" && op.op == "add" {
        let value = require_value(op)?;
        let spec: AutomationSpec = serde_json::from_value(value.clone())?;
        let auto = crate::automation::Automation {
            target_node_id: spec.node_id.clone(),
            target_param_id: spec.param_id.clone(),
            points: spec
                .points
                .iter()
                .map(|p| crate::automation::AutomationPoint {
                    tick: p.tick,
                    value: p.value,
                    curve: crate::automation::Curve::from_label(&p.curve),
                })
                .collect(),
        };
        graph.tracks[ti].automation.push(auto);
        return Ok(());
    }
    // Whole-replace at /tracks/{tid}/automation
    if op.op == "replace" {
        let value = require_value(op)?;
        let specs: Vec<AutomationSpec> = serde_json::from_value(value.clone())?;
        graph.tracks[ti].automation = specs
            .iter()
            .map(|spec| crate::automation::Automation {
                target_node_id: spec.node_id.clone(),
                target_param_id: spec.param_id.clone(),
                points: spec
                    .points
                    .iter()
                    .map(|p| crate::automation::AutomationPoint {
                        tick: p.tick,
                        value: p.value,
                        curve: crate::automation::Curve::from_label(&p.curve),
                    })
                    .collect(),
            })
            .collect();
        return Ok(());
    }
    Err(anyhow::anyhow!("unsupported automation sub-path"))
}

fn apply_bus(graph: &mut Graph, segs: &[String], op: &JsonPatchOp) -> anyhow::Result<()> {
    if segs.is_empty() {
        return Err(anyhow::anyhow!("missing bus id or '-'"));
    }
    let head = segs[0].as_str();
    if head == "-" {
        let value = require_value(op)?;
        let spec: BusState = serde_json::from_value(value.clone())?;
        let mut b = Bus::from_spec(&spec, graph.sample_rate);
        for ins in b.inserts.iter_mut() {
            ins.effect.set_sample_rate(graph.sample_rate);
        }
        graph.buses.push(b);
        return Ok(());
    }
    let bus_id = head;
    let bi = graph
        .bus_index(bus_id)
        .ok_or_else(|| anyhow::anyhow!("unknown bus id: {bus_id}"))?;
    if segs.len() == 1 {
        if op.op == "remove" {
            graph.buses.remove(bi);
            return Ok(());
        }
        return Err(anyhow::anyhow!("only 'remove' supported on bus root path"));
    }
    let field = segs[1].as_str();
    match field {
        "volumeDb" => {
            graph.buses[bi].volume_db = require_value(op)?
                .as_f64()
                .ok_or_else(|| anyhow::anyhow!("expected number"))?;
        }
        "pan" => {
            graph.buses[bi].pan = require_value(op)?
                .as_f64()
                .ok_or_else(|| anyhow::anyhow!("expected number"))?;
        }
        "name" => {
            graph.buses[bi].name = require_value(op)?
                .as_str()
                .ok_or_else(|| anyhow::anyhow!("expected string"))?
                .to_string();
        }
        "inserts" => apply_bus_inserts(graph, bi, &segs[2..], op)?,
        "sends" => apply_bus_sends(graph, bi, &segs[2..], op)?,
        other => return Err(anyhow::anyhow!("unsupported bus field: {other}")),
    }
    Ok(())
}

fn apply_bus_inserts(
    graph: &mut Graph,
    bi: usize,
    rest: &[String],
    op: &JsonPatchOp,
) -> anyhow::Result<()> {
    if rest.is_empty() {
        return Err(anyhow::anyhow!("bus inserts requires sub-path"));
    }
    let head = rest[0].as_str();
    if head == "-" {
        let value = require_value(op)?;
        let spec: ChainNodeSpec = serde_json::from_value(value.clone())?;
        let node = EffectNode::from_spec(&spec)
            .ok_or_else(|| anyhow::anyhow!("unsupported plugin: {}", spec.plugin.uid))?;
        graph.buses[bi].inserts.push(node);
        return Ok(());
    }
    let node_id = head;
    if rest.len() == 1 && op.op == "remove" {
        let before = graph.buses[bi].inserts.len();
        graph.buses[bi].inserts.retain(|n| n.id != node_id);
        if graph.buses[bi].inserts.len() == before {
            return Err(anyhow::anyhow!("unknown insert id: {node_id}"));
        }
        return Ok(());
    }
    if rest.len() >= 3 && rest[1] == "params" {
        let v = require_value(op)?
            .as_f64()
            .ok_or_else(|| anyhow::anyhow!("expected number"))?;
        let node = graph.buses[bi]
            .inserts
            .iter_mut()
            .find(|n| n.id == node_id)
            .ok_or_else(|| anyhow::anyhow!("unknown insert id: {node_id}"))?;
        node.effect.set_param(&rest[2], v);
        return Ok(());
    }
    Err(anyhow::anyhow!("unsupported bus insert sub-path"))
}

fn apply_bus_sends(
    graph: &mut Graph,
    bi: usize,
    rest: &[String],
    op: &JsonPatchOp,
) -> anyhow::Result<()> {
    if rest.is_empty() {
        return Err(anyhow::anyhow!("bus sends requires sub-path"));
    }
    let head = rest[0].as_str();
    if head == "-" {
        let value = require_value(op)?;
        let spec: SendSpec = serde_json::from_value(value.clone())?;
        graph.buses[bi].sends.push(Send::from(&spec));
        return Ok(());
    }
    let send_id = head;
    if rest.len() == 1 && op.op == "remove" {
        let before = graph.buses[bi].sends.len();
        graph.buses[bi].sends.retain(|s| s.id != send_id);
        if graph.buses[bi].sends.len() == before {
            return Err(anyhow::anyhow!("unknown send id: {send_id}"));
        }
        return Ok(());
    }
    if rest.len() >= 2 {
        let send = graph.buses[bi]
            .sends
            .iter_mut()
            .find(|s| s.id == send_id)
            .ok_or_else(|| anyhow::anyhow!("unknown send id: {send_id}"))?;
        match rest[1].as_str() {
            "level" => {
                send.level = require_value(op)?
                    .as_f64()
                    .ok_or_else(|| anyhow::anyhow!("expected number"))?
                    as f32;
            }
            "pre" => {
                send.pre_fader = require_value(op)?
                    .as_bool()
                    .ok_or_else(|| anyhow::anyhow!("expected bool"))?;
            }
            "destBusId" => {
                send.dest_bus_id = require_value(op)?
                    .as_str()
                    .ok_or_else(|| anyhow::anyhow!("expected string"))?
                    .to_string();
            }
            other => return Err(anyhow::anyhow!("unsupported send field: {other}")),
        }
        return Ok(());
    }
    Err(anyhow::anyhow!("unsupported bus send sub-path"))
}

fn apply_master(graph: &mut Graph, segs: &[String], op: &JsonPatchOp) -> anyhow::Result<()> {
    if segs.is_empty() {
        return Err(anyhow::anyhow!("master requires sub-path"));
    }
    match segs[0].as_str() {
        "volumeDb" => {
            graph.master.volume_db = require_value(op)?
                .as_f64()
                .ok_or_else(|| anyhow::anyhow!("expected number"))?;
        }
        "inserts" => {
            if segs.len() < 2 {
                return Err(anyhow::anyhow!("master.inserts requires sub-path"));
            }
            let head = segs[1].as_str();
            if head == "-" {
                let value = require_value(op)?;
                let spec: ChainNodeSpec = serde_json::from_value(value.clone())?;
                let node = EffectNode::from_spec(&spec)
                    .ok_or_else(|| anyhow::anyhow!("unsupported plugin: {}", spec.plugin.uid))?;
                graph.master.inserts.push(node);
                return Ok(());
            }
            let node_id = head;
            if segs.len() == 2 && op.op == "remove" {
                let before = graph.master.inserts.len();
                graph.master.inserts.retain(|n| n.id != node_id);
                if graph.master.inserts.len() == before {
                    return Err(anyhow::anyhow!("unknown insert id: {node_id}"));
                }
                return Ok(());
            }
            if segs.len() >= 4 && segs[2] == "params" {
                let v = require_value(op)?
                    .as_f64()
                    .ok_or_else(|| anyhow::anyhow!("expected number"))?;
                let node = graph
                    .master
                    .inserts
                    .iter_mut()
                    .find(|n| n.id == node_id)
                    .ok_or_else(|| anyhow::anyhow!("unknown insert id: {node_id}"))?;
                node.effect.set_param(&segs[3], v);
                return Ok(());
            }
            return Err(anyhow::anyhow!("unsupported master insert sub-path"));
        }
        other => return Err(anyhow::anyhow!("unsupported master field: {other}")),
    }
    Ok(())
}

fn require_value(op: &JsonPatchOp) -> anyhow::Result<&serde_json::Value> {
    op.value
        .as_ref()
        .ok_or_else(|| anyhow::anyhow!("op {} missing value", op.op))
}

/// Split a JSON Pointer path into segments. Implements the basic
/// `/foo/bar` form plus RFC 6901 escapes (`~0` → `~`, `~1` → `/`).
fn parse_path(path: &str) -> Vec<String> {
    if path.is_empty() {
        return Vec::new();
    }
    if !path.starts_with('/') {
        // Tolerate caller passing without leading slash.
        return path.split('/').map(unescape).collect();
    }
    path.trim_start_matches('/').split('/').map(unescape).collect()
}

fn unescape(s: &str) -> String {
    s.replace("~1", "/").replace("~0", "~")
}

// ── Project-level patcher ───────────────────────────────────────────────

/// Apply RFC 6902 ops directly to a `Project` (the source of truth on the
/// network thread). Mirrors `apply_patch` for `Graph` but operates on the
/// serializable `Project` model so the network thread can rebuild a fresh
/// `Graph` (with real instruments) afterwards.
pub fn apply_patch_to_project(project: &mut Project, ops: &[JsonPatchOp]) -> anyhow::Result<usize> {
    let mut applied = 0;
    for op in ops {
        apply_one_project(project, op).map_err(|e| {
            anyhow::anyhow!("patch op {} on {} failed: {e}", op.op, op.path)
        })?;
        applied += 1;
    }
    Ok(applied)
}

fn apply_one_project(project: &mut Project, op: &JsonPatchOp) -> anyhow::Result<()> {
    let segs = parse_path(&op.path);
    if segs.is_empty() {
        return Err(anyhow::anyhow!("empty path"));
    }
    match segs[0].as_str() {
        "tracks" => apply_project_track(project, &segs[1..], op),
        "buses" => apply_project_bus(project, &segs[1..], op),
        "master" => apply_project_master(project, &segs[1..], op),
        other => Err(anyhow::anyhow!("unsupported path root: /{other}")),
    }
}

fn apply_project_track(
    project: &mut Project,
    segs: &[String],
    op: &JsonPatchOp,
) -> anyhow::Result<()> {
    if segs.is_empty() {
        return Err(anyhow::anyhow!("missing track id"));
    }
    let track_id = &segs[0];
    let ti = project
        .tracks
        .iter()
        .position(|t| &t.id == track_id)
        .ok_or_else(|| anyhow::anyhow!("unknown track id: {track_id}"))?;
    if segs.len() == 1 {
        return Err(anyhow::anyhow!("whole-track replace not supported"));
    }
    match segs[1].as_str() {
        "volumeDb" => {
            project.tracks[ti].volume_db = require_value(op)?
                .as_f64()
                .ok_or_else(|| anyhow::anyhow!("expected number"))?;
        }
        "pan" => {
            project.tracks[ti].pan = require_value(op)?
                .as_f64()
                .ok_or_else(|| anyhow::anyhow!("expected number"))?;
        }
        "mute" => {
            project.tracks[ti].mute = require_value(op)?
                .as_bool()
                .ok_or_else(|| anyhow::anyhow!("expected bool"))?;
        }
        "solo" => {
            project.tracks[ti].solo = require_value(op)?
                .as_bool()
                .ok_or_else(|| anyhow::anyhow!("expected bool"))?;
        }
        "inserts" => {
            apply_project_inserts(&mut project.tracks[ti].inserts, &segs[2..], op)?
        }
        "sends" => apply_project_sends(&mut project.tracks[ti].sends, &segs[2..], op)?,
        "automation" => {
            apply_project_automation(&mut project.tracks[ti].automation, &segs[2..], op)?
        }
        other => return Err(anyhow::anyhow!("unsupported track field: {other}")),
    }
    Ok(())
}

fn apply_project_inserts(
    list: &mut Vec<ChainNodeSpec>,
    rest: &[String],
    op: &JsonPatchOp,
) -> anyhow::Result<()> {
    if rest.is_empty() {
        return Err(anyhow::anyhow!("inserts requires sub-path"));
    }
    let head = rest[0].as_str();
    if head == "-" {
        let value = require_value(op)?;
        let spec: ChainNodeSpec = serde_json::from_value(value.clone())?;
        list.push(spec);
        return Ok(());
    }
    let node_id = head;
    if rest.len() == 1 {
        if op.op == "remove" {
            let before = list.len();
            list.retain(|n| n.id != node_id);
            if list.len() == before {
                return Err(anyhow::anyhow!("unknown insert id: {node_id}"));
            }
            return Ok(());
        }
        return Err(anyhow::anyhow!("only 'remove' supported on insert path"));
    }
    if rest.len() >= 3 && rest[1] == "params" {
        let v = require_value(op)?
            .as_f64()
            .ok_or_else(|| anyhow::anyhow!("expected number"))?;
        let node = list
            .iter_mut()
            .find(|n| n.id == node_id)
            .ok_or_else(|| anyhow::anyhow!("unknown insert id: {node_id}"))?;
        node.params
            .insert(rest[2].clone(), serde_json::Value::from(v));
        return Ok(());
    }
    if rest.len() >= 2 && rest[1] == "bypass" {
        let v = require_value(op)?
            .as_bool()
            .ok_or_else(|| anyhow::anyhow!("expected bool"))?;
        let node = list
            .iter_mut()
            .find(|n| n.id == node_id)
            .ok_or_else(|| anyhow::anyhow!("unknown insert id: {node_id}"))?;
        node.bypass = v;
        return Ok(());
    }
    Err(anyhow::anyhow!("unsupported insert sub-path"))
}

fn apply_project_sends(
    list: &mut Vec<SendSpec>,
    rest: &[String],
    op: &JsonPatchOp,
) -> anyhow::Result<()> {
    if rest.is_empty() {
        return Err(anyhow::anyhow!("sends requires sub-path"));
    }
    let head = rest[0].as_str();
    if head == "-" {
        let value = require_value(op)?;
        let spec: SendSpec = serde_json::from_value(value.clone())?;
        list.push(spec);
        return Ok(());
    }
    let send_id = head;
    if rest.len() == 1 {
        if op.op == "remove" {
            let before = list.len();
            list.retain(|s| s.id != send_id);
            if list.len() == before {
                return Err(anyhow::anyhow!("unknown send id: {send_id}"));
            }
            return Ok(());
        }
        return Err(anyhow::anyhow!("only 'remove' supported on send path"));
    }
    let send = list
        .iter_mut()
        .find(|s| s.id == send_id)
        .ok_or_else(|| anyhow::anyhow!("unknown send id: {send_id}"))?;
    match rest[1].as_str() {
        "level" => {
            send.level = require_value(op)?
                .as_f64()
                .ok_or_else(|| anyhow::anyhow!("expected number"))?
                as f32;
        }
        "pre" => {
            send.pre = require_value(op)?
                .as_bool()
                .ok_or_else(|| anyhow::anyhow!("expected bool"))?;
        }
        "destBusId" => {
            send.dest_bus_id = require_value(op)?
                .as_str()
                .ok_or_else(|| anyhow::anyhow!("expected string"))?
                .to_string();
        }
        other => return Err(anyhow::anyhow!("unsupported send field: {other}")),
    }
    Ok(())
}

fn apply_project_automation(
    list: &mut Vec<AutomationSpec>,
    rest: &[String],
    op: &JsonPatchOp,
) -> anyhow::Result<()> {
    if rest.is_empty() {
        return Err(anyhow::anyhow!("automation requires sub-path"));
    }
    let head = rest[0].as_str();
    if head == "-" && op.op == "add" {
        let spec: AutomationSpec = serde_json::from_value(require_value(op)?.clone())?;
        list.push(spec);
        return Ok(());
    }
    if op.op == "replace" {
        let specs: Vec<AutomationSpec> =
            serde_json::from_value(require_value(op)?.clone())?;
        *list = specs;
        return Ok(());
    }
    Err(anyhow::anyhow!("unsupported automation sub-path"))
}

fn apply_project_bus(
    project: &mut Project,
    segs: &[String],
    op: &JsonPatchOp,
) -> anyhow::Result<()> {
    if segs.is_empty() {
        return Err(anyhow::anyhow!("missing bus id or '-'"));
    }
    let head = segs[0].as_str();
    if head == "-" {
        let spec: BusState = serde_json::from_value(require_value(op)?.clone())?;
        project.buses.push(spec);
        return Ok(());
    }
    let bus_id = head;
    let bi = project
        .buses
        .iter()
        .position(|b| b.id == bus_id)
        .ok_or_else(|| anyhow::anyhow!("unknown bus id: {bus_id}"))?;
    if segs.len() == 1 {
        if op.op == "remove" {
            project.buses.remove(bi);
            return Ok(());
        }
        return Err(anyhow::anyhow!("only 'remove' supported on bus root path"));
    }
    match segs[1].as_str() {
        "volumeDb" => {
            project.buses[bi].volume_db = require_value(op)?
                .as_f64()
                .ok_or_else(|| anyhow::anyhow!("expected number"))?;
        }
        "pan" => {
            project.buses[bi].pan = require_value(op)?
                .as_f64()
                .ok_or_else(|| anyhow::anyhow!("expected number"))?;
        }
        "name" => {
            project.buses[bi].name = require_value(op)?
                .as_str()
                .ok_or_else(|| anyhow::anyhow!("expected string"))?
                .to_string();
        }
        "inserts" => apply_project_inserts(&mut project.buses[bi].inserts, &segs[2..], op)?,
        "sends" => apply_project_sends(&mut project.buses[bi].sends, &segs[2..], op)?,
        other => return Err(anyhow::anyhow!("unsupported bus field: {other}")),
    }
    Ok(())
}

fn apply_project_master(
    project: &mut Project,
    segs: &[String],
    op: &JsonPatchOp,
) -> anyhow::Result<()> {
    if segs.is_empty() {
        return Err(anyhow::anyhow!("master requires sub-path"));
    }
    match segs[0].as_str() {
        "volumeDb" => {
            project.master.volume_db = require_value(op)?
                .as_f64()
                .ok_or_else(|| anyhow::anyhow!("expected number"))?;
        }
        "inserts" => apply_project_inserts(&mut project.master.inserts, &segs[1..], op)?,
        other => return Err(anyhow::anyhow!("unsupported master field: {other}")),
    }
    Ok(())
}

// ── Bus::from_spec helper used by patch ─────────────────────────────────

impl Bus {
    pub fn from_spec(spec: &BusState, sample_rate: u32) -> Self {
        let mut b = Bus {
            id: spec.id.clone(),
            name: spec.name.clone(),
            inserts: spec.inserts.iter().filter_map(EffectNode::from_spec).collect(),
            sends: spec.sends.iter().map(Send::from).collect(),
            volume_db: spec.volume_db,
            pan: spec.pan,
            input_buffer: Vec::new(),
        };
        for ins in b.inserts.iter_mut() {
            ins.effect.set_sample_rate(sample_rate);
        }
        b
    }
}


#[cfg(test)]
mod tests {
    use super::*;
    use crate::{Graph, SilentInstrument};
    use bridge_protocol::{JsonPatchOp, Project};
    use serde_json::json;

    fn empty_project() -> Project {
        Project {
            version: "1".into(),
            bpm: 120.0,
            time_signature: [4, 4],
            sample_rate: 48_000,
            tracks: vec![bridge_protocol::TrackState {
                id: "t1".into(),
                name: "T".into(),
                instrument: None,
                clips: vec![],
                volume_db: 0.0,
                pan: 0.0,
                mute: false,
                solo: false,
                inserts: vec![],
                sends: vec![],
                automation: vec![],
            }],
            buses: vec![],
            master: Default::default(),
        }
    }

    #[test]
    fn replace_volume_db() {
        let p = empty_project();
        let mut g = Graph::from_project(&p, |_| Some(Box::new(SilentInstrument))).unwrap();
        let ops = vec![JsonPatchOp {
            op: "replace".into(),
            path: "/tracks/t1/volumeDb".into(),
            value: Some(json!(-3.0)),
        }];
        apply_patch(&mut g, &ops).unwrap();
        assert!((g.tracks[0].volume_db - -3.0).abs() < 1e-9);
    }

    #[test]
    fn add_insert_then_remove() {
        let p = empty_project();
        let mut g = Graph::from_project(&p, |_| Some(Box::new(SilentInstrument))).unwrap();
        let add = JsonPatchOp {
            op: "add".into(),
            path: "/tracks/t1/inserts/-".into(),
            value: Some(json!({
                "id": "i1",
                "kind": "insert",
                "plugin": {"format":"builtin","uid":"gain","name":"Gain"},
                "params": {"gainDb": -6.0}
            })),
        };
        apply_patch(&mut g, &[add]).unwrap();
        assert_eq!(g.tracks[0].inserts.len(), 1);

        let setp = JsonPatchOp {
            op: "replace".into(),
            path: "/tracks/t1/inserts/i1/params/gainDb".into(),
            value: Some(json!(-12.0)),
        };
        apply_patch(&mut g, &[setp]).unwrap();
        assert!((g.tracks[0].inserts[0].effect.get_param("gainDb") - -12.0).abs() < 1e-6);

        let rm = JsonPatchOp {
            op: "remove".into(),
            path: "/tracks/t1/inserts/i1".into(),
            value: None,
        };
        apply_patch(&mut g, &[rm]).unwrap();
        assert_eq!(g.tracks[0].inserts.len(), 0);
    }

    #[test]
    fn unknown_path_errors() {
        let p = empty_project();
        let mut g = Graph::from_project(&p, |_| Some(Box::new(SilentInstrument))).unwrap();
        let bad = JsonPatchOp {
            op: "replace".into(),
            path: "/wat".into(),
            value: Some(json!(0)),
        };
        assert!(apply_patch(&mut g, &[bad]).is_err());
    }

    #[test]
    fn rfc6901_unescaping() {
        assert_eq!(parse_path("/a~1b/c~0d"), vec!["a/b", "c~d"]);
    }

    // ── Project-level patcher tests ──────────────────────────────────────

    #[test]
    fn project_replace_volume() {
        let mut p = empty_project();
        let ops = vec![JsonPatchOp {
            op: "replace".into(),
            path: "/tracks/t1/volumeDb".into(),
            value: Some(json!(-9.0)),
        }];
        let n = apply_patch_to_project(&mut p, &ops).unwrap();
        assert_eq!(n, 1);
        assert!((p.tracks[0].volume_db - -9.0).abs() < 1e-9);
    }

    #[test]
    fn project_add_insert_persists_in_project() {
        let mut p = empty_project();
        let ops = vec![JsonPatchOp {
            op: "add".into(),
            path: "/tracks/t1/inserts/-".into(),
            value: Some(json!({
                "id": "i1",
                "kind": "insert",
                "plugin": {"format":"builtin","uid":"gain","name":"Gain"},
                "params": {"gainDb": -6.0}
            })),
        }];
        apply_patch_to_project(&mut p, &ops).unwrap();
        assert_eq!(p.tracks[0].inserts.len(), 1);
        assert_eq!(p.tracks[0].inserts[0].plugin.uid, "gain");
    }

    #[test]
    fn project_add_send_then_replace_level() {
        let mut p = empty_project();
        // First add a target bus
        let add_bus = JsonPatchOp {
            op: "add".into(),
            path: "/buses/-".into(),
            value: Some(json!({
                "id":"bus1","name":"Reverb","inserts":[],"sends":[],"volumeDb":0.0,"pan":0.0
            })),
        };
        apply_patch_to_project(&mut p, &[add_bus]).unwrap();
        let add_send = JsonPatchOp {
            op: "add".into(),
            path: "/tracks/t1/sends/-".into(),
            value: Some(json!({
                "id":"s1","destBusId":"bus1","level":0.3,"pre":false
            })),
        };
        apply_patch_to_project(&mut p, &[add_send]).unwrap();
        assert_eq!(p.tracks[0].sends.len(), 1);
        let replace = JsonPatchOp {
            op: "replace".into(),
            path: "/tracks/t1/sends/s1/level".into(),
            value: Some(json!(0.7)),
        };
        apply_patch_to_project(&mut p, &[replace]).unwrap();
        assert!((p.tracks[0].sends[0].level - 0.7).abs() < 1e-6);
    }
}

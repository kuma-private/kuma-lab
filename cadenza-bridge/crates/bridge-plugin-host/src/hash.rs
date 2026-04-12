//! Project hashing for integrity checks. Uses blake3 over a deterministic
//! serialization (sorted keys) of the project JSON.

use bridge_protocol::Project;

/// Compute the blake3 hex digest of `project` after serializing it with
/// sorted keys (so the hash is stable across re-orderings of the JSON map).
pub fn hash_project(project: &Project) -> String {
    let value = serde_json::to_value(project).expect("project always serializes");
    let canonical = canonicalize(&value);
    let bytes = serde_json::to_vec(&canonical).expect("canonical serialise");
    let hash = blake3::hash(&bytes);
    hash.to_hex().to_string()
}

/// Recursively rebuild a JSON value with object keys in sorted order so two
/// semantically equivalent JSON values produce the same byte stream.
fn canonicalize(v: &serde_json::Value) -> serde_json::Value {
    match v {
        serde_json::Value::Object(m) => {
            let mut keys: Vec<&String> = m.keys().collect();
            keys.sort();
            let mut out = serde_json::Map::with_capacity(m.len());
            for k in keys {
                out.insert(k.clone(), canonicalize(&m[k]));
            }
            serde_json::Value::Object(out)
        }
        serde_json::Value::Array(a) => {
            serde_json::Value::Array(a.iter().map(canonicalize).collect())
        }
        other => other.clone(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use bridge_protocol::TrackState;

    fn p() -> Project {
        Project {
            version: "1".into(),
            bpm: 120.0,
            time_signature: [4, 4],
            sample_rate: 48_000,
            tracks: vec![TrackState {
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
    fn deterministic_hash() {
        let p1 = p();
        let p2 = p();
        assert_eq!(hash_project(&p1), hash_project(&p2));
    }

    #[test]
    fn hash_changes_with_data() {
        let p1 = p();
        let mut p2 = p();
        p2.tracks[0].volume_db = -3.0;
        assert_ne!(hash_project(&p1), hash_project(&p2));
    }
}

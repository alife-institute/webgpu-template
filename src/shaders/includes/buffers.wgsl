struct Segment {
  id: u32,
  subtype: u32,
  pass_id: u32,
  position: vec2f,
  orientation: vec2f,
  tail: u32,
  head: u32,
}

fn is_disconnected(segment: Segment) -> bool {
  return segment.tail == segment.id && segment.head == segment.id;
}

fn has_head(segment: Segment) -> bool {
  return segment.head != segment.id;
}

fn has_tail(segment: Segment) -> bool {
  return segment.tail != segment.id;
}

fn is_end(segment: Segment) -> bool {
  return segment.tail == segment.id || segment.head == segment.id;
}

fn has_connection(segment: Segment) -> bool {
  return segment.tail != segment.id || segment.head != segment.id;
}

fn has_both_connections(segment: Segment) -> bool {
  return segment.tail != segment.id && segment.head != segment.id;
}

fn disconnect_from_head(idx: u32, segments: ptr<storage, array<Segment>, read_write>) {
  let segment = segments[idx];

  segments[segment.head].tail = segments[segment.head].id;
  segments[idx].head = segment.id;
}

fn disconnect_from_tail(idx: u32, segments: ptr<storage, array<Segment>, read_write>) {
  let segment = segments[idx];

  segments[segment.tail].head = segments[segment.tail].id;
  segments[idx].tail = segment.id;
}


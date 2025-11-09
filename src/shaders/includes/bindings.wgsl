const GROUP_INDEX = 0;

const CANVAS = 0;
const CONTROLS = 1;
const INTERACTIONS = 2;

const INDEX = 3;
const SEGMENT_INDEX = 0;

const STERIC_POTENTIAL = 4;
const STERIC_POTENTIAL_DIM = 3;
const TYPE_MONOMER = 0;
const TYPE_POLYMER = 1;
const TYPE_MEMBRANE = 2;

const PARAMETER_FIELDS = 5;
const DEBUG = 0;
const CONNECTION_PROBABILITY = 1;
const RECENCY = 2;
const FOODCLICK = 3;

const RANDOM = 6;
const MEMBRANE = 7;
const ACTIN = 8;
const CONNECTION_LOCKS = 9;
const PREY = 10;

const BINDING_INTERMEDIATE_TEXTURE = 10;


// TODO: maybe put elsewhere, but best place for now
// Define the Controls struct matching TypeScript layout
struct Controls {    
    membraneCount: u32,        // offset 0, size 4, align 4
    actinCount: u32,           // offset 4, size 4, align 4
    stiffness: f32,     // offset 8, size 4, align 4
    equilibrium_angle: f32,     // offset 12, size 4, align 4
    disconnection_probability: f32,          // offset 16, size 4, align 4
    polymerRepulsion: f32,        // offset 20, size 4, align 4
    steric_sampling_range: i32,// offset 24, size 4, align 4
    actinCohesionRange: i32,   // offset 28, size 4, align 4
    bindProb: f32,            // offset 32, size 4, align 4
    monomerBindProbReduction: f32,             // offset 36, size 4, align 4
    actinStericForce: f32,                // offset 40, size 4, align 4
    equilibrium_line_distance: f32,     // offset 44, size 4, align 4
    foodSpawnArea: f32,// offset 48, size 4, align 4
    movementMode: u32,        // offset 52, size 4, align 4
                               // Total size = 56 bytes. Padded size = 64 bytes.
}
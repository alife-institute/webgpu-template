# Dimensionality Reduction

This example demonstrates a dimensionality reduction technique inspired by boid and slime mould simulations. Particles (nodes) move in a 2D space and cluster based on feature similarity.

## How it Works

Each particle has a position, an orientation, and a feature vector of dimensionality `N`.

1.  **Trail Dropping**: Particles leave a "scent" in a multi-layered storage texture. Each layer corresponds to one dimension of the feature vector.
2.  **Sensing**: Particles sample the trail density at three locations (center, left, right) in front of them.
3.  **Steering**: Particles calculate the cosine similarity (dot product of normalized vectors) between their own feature vector and the sampled trail vectors. They turn towards the direction with the highest similarity.
4.  **Decay and Blur**: The trail textures decay over time and are blurred to allow signals to propagate spatially.

Over time, particles with similar features tend to follow each other's trails, leading to the emergence of clusters in the 2D space that represent proximity in the N-dimensional feature space.

## Configuration

The simulation can be generalized to any number of dimensions by changing the `FEATURE_DIMENSION` constant in `src/examples/dimensionality-reduction/index.ts`.

- **Sensor Angle**: The field of view for the sensors.
- **Sensor Offset**: How far ahead the particle "smells".
- **Steer Angle**: The maximum turn speed.
- **Trail Decay Rate**: How quickly trails disappear.

## Visualization

The first 3 dimensions of the feature vector are mapped to Red, Green, and Blue. For `N > 3`, dimensions are accumulated into these channels using modulo mapping (`i % 3`).

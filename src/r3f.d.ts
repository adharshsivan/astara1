import type { ThreeElements } from '@react-three/fiber';

/**
 * React 19 removed the global JSX namespace merge that react-three-fiber used to
 * rely on, so the element catalogue is re-declared here for the whole project.
 */
declare global {
  namespace React {
    namespace JSX {
      interface IntrinsicElements extends ThreeElements {}
    }
  }
}

export {};

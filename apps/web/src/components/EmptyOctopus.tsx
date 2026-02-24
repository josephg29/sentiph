export const EmptyOctopus = () => {
  return (
    <svg
      className="octopus-svg"
      viewBox="0 0 160 160"
      data-testid="empty-octopus"
      aria-hidden="true"
    >
      <g className="octopus-tentacle-group octopus-tentacle-1">
        <path d="M80 42 C76 34 83 28 80 22" className="octopus-tentacle-path" />
      </g>
      <g className="octopus-tentacle-group octopus-tentacle-2">
        <path d="M105 53 C110 48 113 45 118 40" className="octopus-tentacle-path" />
      </g>
      <g className="octopus-tentacle-group octopus-tentacle-3">
        <path d="M114 80 C121 77 126 83 132 80" className="octopus-tentacle-path" />
      </g>
      <g className="octopus-tentacle-group octopus-tentacle-4">
        <path d="M105 107 C110 112 113 115 118 120" className="octopus-tentacle-path" />
      </g>
      <g className="octopus-tentacle-group octopus-tentacle-5">
        <path d="M80 118 C84 126 77 132 80 138" className="octopus-tentacle-path" />
      </g>
      <g className="octopus-tentacle-group octopus-tentacle-6">
        <path d="M55 107 C50 112 47 115 42 120" className="octopus-tentacle-path" />
      </g>
      <g className="octopus-tentacle-group octopus-tentacle-7">
        <path d="M46 80 C39 83 34 77 28 80" className="octopus-tentacle-path" />
      </g>
      <g className="octopus-tentacle-group octopus-tentacle-8">
        <path d="M55 53 C50 48 47 45 42 40" className="octopus-tentacle-path" />
      </g>

      <circle cx="80" cy="80" r="38" className="octopus-head-fill octopus-stroke" />

      <circle cx="67" cy="80" r="6" className="octopus-eye-dot" />
      <circle cx="93" cy="80" r="6" className="octopus-eye-dot" />
    </svg>
  );
};

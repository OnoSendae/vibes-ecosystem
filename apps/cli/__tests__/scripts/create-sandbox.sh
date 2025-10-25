#!/bin/bash

set -e

export SANDBOX_PATH="/tmp/vibe-stash-tests/$(date +%Y%m%d-%H%M%S)"

create_sandbox() {
  echo "🔨 Creating test sandbox..."
  
  mkdir -p "$SANDBOX_PATH"/{bin,config,output,tmp,.vibes/stash,.vibes/packages}
  
  export HOME="$SANDBOX_PATH/config"
  export TMPDIR="$SANDBOX_PATH/tmp"
  export XDG_CONFIG_HOME="$SANDBOX_PATH/config"
  export VIBES_HOME="$SANDBOX_PATH/.vibes"
  
  mkdir -p "$HOME/.cursor/commands"
  mkdir -p "$HOME/.cursor/rules"
  mkdir -p "$HOME/.continue/commands"
  
  echo "✓ Sandbox created: $SANDBOX_PATH"
  echo "  HOME=$HOME"
  echo "  TMPDIR=$TMPDIR"
  echo "  VIBES_HOME=$VIBES_HOME"
  echo ""
}

cleanup_sandbox() {
  if [ -d "$SANDBOX_PATH" ]; then
    echo "🧹 Cleaning up sandbox..."
    rm -rf "$SANDBOX_PATH"
    echo "✓ Sandbox cleaned"
  fi
}

export -f create_sandbox
export -f cleanup_sandbox

if [ "$1" = "cleanup" ]; then
  cleanup_sandbox
else
  create_sandbox
fi


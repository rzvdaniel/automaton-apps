#!/bin/sh
set -eu

project_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
build_root=${AUTOMATON_BUILD_WORKSPACE:-"$project_dir/.automaton-build"}
sdk_dir="$build_root/dotnet-sdk"
sdk_archive="$build_root/dotnet-sdk.tar.gz"
sdk_version=${DOTNET_SDK_VERSION:-9.0.317}

case "$(uname -m)" in
  x86_64|amd64)
    dotnet_arch=x64
    runtime_id=linux-x64
    sdk_archive_name=dotnet-sdk-$sdk_version-linux-x64.tar.gz
    ;;
  aarch64|arm64)
    dotnet_arch=arm64
    runtime_id=linux-arm64
    sdk_archive_name=dotnet-sdk-$sdk_version-linux-arm64.tar.gz
    ;;
  armv7l|armv7)
    dotnet_arch=arm
    runtime_id=linux-arm
    sdk_archive_name=dotnet-sdk-$sdk_version-linux-arm.tar.gz
    ;;
  *)
    echo "Unsupported Linux architecture: $(uname -m)" >&2
    exit 1
    ;;
esac

mkdir -p "$build_root"

if [ ! -x "$sdk_dir/dotnet" ]; then
  if ! command -v curl >/dev/null 2>&1; then
    echo "Cannot bootstrap the .NET SDK: curl is required but was not found." >&2
    exit 1
  fi
  if ! command -v tar >/dev/null 2>&1; then
    echo "Cannot bootstrap the .NET SDK: tar is required but was not found." >&2
    exit 1
  fi

  sdk_url="https://dotnetcli.azureedge.net/dotnet/Sdk/$sdk_version/$sdk_archive_name"
  echo "Downloading .NET SDK $sdk_version ($dotnet_arch) into $build_root" >&2
  if ! curl --fail --location --retry 3 --retry-delay 2 --silent --show-error \
      "$sdk_url" --output "$sdk_archive"; then
    echo "Cannot bootstrap the .NET SDK: downloading $sdk_url failed." >&2
    exit 1
  fi

  echo "Extracting the .NET SDK into $sdk_dir" >&2
  mkdir -p "$sdk_dir"
  if ! tar -xzf "$sdk_archive" -C "$sdk_dir"; then
    echo "Cannot bootstrap the .NET SDK: installation failed." >&2
    exit 1
  fi
  rm -f "$sdk_archive"
fi

if [ ! -x "$sdk_dir/dotnet" ]; then
  echo "Cannot bootstrap the .NET SDK: $sdk_dir/dotnet was not created." >&2
  exit 1
fi

export DOTNET_ROOT="$sdk_dir"
export DOTNET_CLI_HOME="$build_root/dotnet-home"
export DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=1
mkdir -p "$DOTNET_CLI_HOME"
rm -rf "$project_dir/out"

"$sdk_dir/dotnet" publish "$project_dir/GenericRuntimeAspNet.csproj" \
  --configuration Release \
  --runtime "$runtime_id" \
  --self-contained true \
  --output "$project_dir/out" \
  -p:PublishSingleFile=true \
  -p:IncludeNativeLibrariesForSelfExtract=true \
  -p:EnableCompressionInSingleFile=true \
  -p:InvariantGlobalization=true \
  -p:DebugType=None \
  -p:DebugSymbols=false

if [ ! -x "$project_dir/out/GenericRuntimeAspNet" ]; then
  echo "The build completed without the expected executable: $project_dir/out/GenericRuntimeAspNet" >&2
  exit 1
fi

echo "Published self-contained runtime: $project_dir/out/GenericRuntimeAspNet" >&2

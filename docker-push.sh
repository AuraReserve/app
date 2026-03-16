#!/bin/bash
set -e

REGISTRY="ghcr.io/aurareserve"
IMAGE="aurareserve-app"
TAG=$(git rev-parse --short HEAD)

echo "Building $REGISTRY/$IMAGE:$TAG ..."
docker build -t $REGISTRY/$IMAGE:$TAG -t $REGISTRY/$IMAGE:latest .

echo "Pushing $REGISTRY/$IMAGE:$TAG ..."
docker push $REGISTRY/$IMAGE:$TAG
docker push $REGISTRY/$IMAGE:latest

echo "Done: $REGISTRY/$IMAGE:$TAG"
echo "Done: $REGISTRY/$IMAGE:latest"

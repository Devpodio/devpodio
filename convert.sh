#!/bin/bash


find ./packages -type f -exec sed -i '/node-pty/!s/@theia/@devpodio/g' {} \;
echo 'packages done'
find ./dev-packages -type f -exec sed -i '/node-pty/!s/@theia/@devpodio/g' {} \;
echo 'dev packages done'

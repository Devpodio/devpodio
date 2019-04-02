#!/bin/bash



find ./packages -type f -exec sed -i '/@devpodio/s/\^0.5.0/\^0.4.4/g' {} \;
echo 'dev-packages done'

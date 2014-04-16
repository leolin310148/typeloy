#!/bin/bash
set -e

cd /opt/<%= appName %>/tmp
sudo rm -rf bundle
sudo tar xvzf bundle.tar.gz > /dev/null
cd bundle/programs/server
sudo npm install fibers

cd /opt/<%= appName %>/

# remove old app, if exists
if [ -d old_app ]; then
  sudo rm -rf old_app
fi

## backup current version
if [[ -d app ]]; then
  sudo mv app old_app
fi 

sudo mv tmp/bundle app

# restart app
sudo stop <%= appName %> || :
sudo start <%= appName %> || :

revert_app (){
  if [[ -d old_app ]]; then
    sudo rm -rf app
    sudo mv old_app app
    sudo stop <%= appName %> || :
    sudo start <%= appName %> || :

    echo "reverted back to the previous version due to the latest version didn't pick up!" 1>&2
    exit 1
  else
    echo "app didn't pick up! - please check app logs" 1>&2
    exit 1
  fi
}

#wait and check
echo "wait for mongo(5 minutes) to initialize"
. /opt/<%= appName %>/config/env.sh
wait-for-mongo $MONGO_URL 300000

echo "waiting for <%= deployCheckWaitTime %> secs while app is booting up"
sleep <%= deployCheckWaitTime %>

echo "checking for app is booted or not?"
curl localhost:$PORT || revert_app
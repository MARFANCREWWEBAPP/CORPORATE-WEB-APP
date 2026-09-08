'use strict';
const path=require('node:path');
process.env.DEMO_MODE='1';
process.env.PORTAL_ENABLED='1';
process.env.PORT=process.env.PORT||'3210';
process.env.APP_ORIGIN=process.env.APP_ORIGIN||(process.env.RAILWAY_PUBLIC_DOMAIN?'https://'+process.env.RAILWAY_PUBLIC_DOMAIN:'http://localhost:'+process.env.PORT);
process.env.HOST=process.env.HOST||(process.env.RAILWAY_ENVIRONMENT_ID?'0.0.0.0':'127.0.0.1');
process.env.DATA_DIR=process.env.DATA_DIR||path.join(__dirname,'../.demo-data');
require('../portal/server').start();

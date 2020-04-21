let config = {};

config.port = 3011;
config.ws_port = 5667;
config.img_storage_port = 4202;

config.log = {};
config.log.level = 'error'; // Use 'console.log' while testing. Winston logs appear asynchronously, even for the console

config.defaults = {
  adducts: {
    "+": ["+H", "+Na", "+K"],
    "-": ["-H", "+Cl"]
  },
  moldb_names: ['HMDB-v4']
};

config.img_upload = {
  iso_img_fs_path: '/opt/data/metaspace/public/',
  categories: {
    iso_image: {
      type: 'image/png',  // applies only to post requests
      path: '/iso_images/',
      storage_types: ['fs', 'db']
    },
    optical_image: {
      type: 'image/jpeg',
      path: '/optical_images/',
      storage_types: ['fs']
    },
    raw_optical_image: {
      type: 'image/jpeg',
      path: '/raw_optical_images/',
      storage_types: ['fs']
    }
  }
};

config.services = {};
/* Internal ad-hoc service with /v1/datasets and /v1/isotopic_patterns endpoints */
config.services.sm_engine_api_host = "localhost";

config.upload = {};
config.upload.destination = "s3";
config.upload.bucket = "sm-bucket";

config.db = {};
config.db.host = "localhost";
config.db.database = "sm_test";
config.db.user = "sm";
config.db.password = "password";

config.elasticsearch = {};
config.elasticsearch.index = "sm";
config.elasticsearch.host = "localhost";
config.elasticsearch.port = 9200;

config.rabbitmq = {};
config.rabbitmq.host = "localhost";
config.rabbitmq.user = "sm";
config.rabbitmq.password = "password";

config.slack = {};
config.slack.webhook_url = "";
config.slack.channel = "";

config.jwt = {};
config.jwt.secret = "";
config.jwt.algorithm = "HS256";

config.aws = {
  aws_access_key_id: "",
  aws_secret_access_key: "",
  aws_region: ""
};

config.features = {
  graphqlMocks: false
};

module.exports = config;

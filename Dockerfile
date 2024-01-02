FROM ubuntu
RUN apt-get update
RUN apt-get install -y iputils-ping net-tools nodejs openjdk-8-jre wget unzip
CMD [ "bash","/bili_robot/bili_robot.sh"]
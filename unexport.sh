#!/usr/bin/env bash

sudo rm -rf ./bili_robot_logs
sudo rm -rf ./logs
sudo rm ./session.token

if [ -d "/bili_robot" ]
then
    cd /bili_robot
fi

if [ -e "./session.token" ]
then
    rm ./session.token
fi

echo "正在回收端口"

pid=$(netstat -npl 2> /dev/null | grep :5700 | grep go-cqhttp | awk '{print $7}' | awk -F '/' '{print $1}')
if [ "$pid" ]
then
    kill $pid && echo "关闭go-cqhttp占用端口进程:$pid"
else
    echo "无进程占用端口"
fi

pid=$(netstat -npl 2> /dev/null | grep :8080 | awk '{print $7}' | awk -F '/' '{print $1}')
if [ "$pid" ]
then
    kill $pid && echo "关闭qsign占用端口进程:$pid"
else
    echo "无进程占用端口"
fi
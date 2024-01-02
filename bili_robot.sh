#!/usr/bin/env bash
retry_num=0
max_retry_num=30

qsign="qsign/bin/unidbg-fetch-qsign --basePath=qsign/txlib/8.9.63"
go_cqhttp="go-cqhttp/go-cqhttp -faststart -update-protocol -c ./go-cqhttp/config.yml"
nodejs="node script/main.js"
debug="node script/debug.js"

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

folder="./bili_robot_logs/$(date +%F)/$(date +%T)"

if [ ! -d $folder ]
then
    mkdir -p $folder
fi

echo -n "启动qsign中"
nohup $qsign &> "$folder/qsign.log" &
pid=$(netstat -npl 2> /dev/null | grep :8080 | awk '{print $7}' | awk -F '/' '{print $1}')
while [[ !(("$pid")) && $retry_num -lt $max_retry_num ]]
do
    sleep 1
    pid=$(netstat -npl 2> /dev/null | grep :8080 | awk '{print $7}' | awk -F '/' '{print $1}')
    ((retry_num++))
    echo -n .
done

if [ ! "$pid" ]
then
    echo "启动qsign失败" >> "$folder/error.log"
    exit 1
fi
echo -e "\nqsign服务启动,pid:$pid"
sleep 30

echo -n "启动go-cqhttp中"
nohup $go_cqhttp &> "$folder/go-cqhttp.log" &
pid=$(netstat -npl 2> /dev/null | grep :5700 | grep go-cqhttp | awk '{print $7}' | awk -F '/' '{print $1}')
while [[ !(("$pid")) && $retry_num -lt $max_retry_num ]]
do
    sleep 1
    pid=$(netstat -npl 2> /dev/null | grep :5700 | grep go-cqhttp | awk '{print $7}' | awk -F '/' '{print $1}')
    ((retry_num++))
    echo -n .
done

if [ "$pid" ]
then
    echo -e "\ngo-cqhttp服务启动,pid:$pid"
    if [ "$1" = "--debug" ]
    then
        echo "调试模式"
        $debug
    else
        echo "nodejs脚本运行中"
        nohup $nodejs &> "$folder/nodejs.log"
    fi
else
    echo "启动cq-http失败" >> "$folder/error.log"
    echo -e "\n登录失败，请进行手动登录"
    echo "完成登录后，请手动重启"
    pid=$(netstat -npl 2> /dev/null | grep :5700 | grep go-cqhttp | awk '{print $7}' | awk -F '/' '{print $1}')
    if [ "$pid" ]
    then
        kill $pid
    fi
    $go_cqhttp
fi
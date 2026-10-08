FROM php:8.2-apache

RUN apt-get update \
    && apt-get install -y libcurl4-openssl-dev \
    && docker-php-ext-install curl \
    && a2enmod rewrite headers \
    && rm -rf /var/lib/apt/lists/*

# Serve the app from the Apache document root
COPY . /var/www/html/

EXPOSE 80
